import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_STDERR_CHARS,
  ACP_METHOD_INITIALIZE,
  ACP_METHOD_SESSION_REQUEST_PERMISSION,
  ACP_METHOD_SESSION_UPDATE,
  ACP_PROTOCOL_VERSION,
  LIB_VERSION,
} from "./constants.js";
import {
  type JsonRpcMessage,
  type JsonRpcRequestMessage,
  type JsonRpcNotificationMessage,
  type JsonRpcResponseMessage,
  type GeminiAcpInitializeResponse,
  type GeminiAcpNotificationEnvelope,
  type GeminiAcpPermissionRequest,
  type GeminiLogger,
} from "./types.js";
import { GeminiProcessError, GeminiProtocolError, GeminiRequestError, GeminiTimeoutError } from "./errors.js";
import { toMessage } from "./utils.js";

/**
 * Tracks an in-flight JSON-RPC request together with its settlement
 * callbacks and optional timeout handle.
 *
 * @internal
 */
interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout?: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Callback handlers supplied by the caller when constructing a
 * {@link JsonRpcStdioClient}.  These are invoked in response to
 * protocol-level events received from the child process.
 *
 * @internal
 */
interface ClientHandlers {
  readonly onSessionUpdate: (envelope: GeminiAcpNotificationEnvelope) => void;
  readonly onPermissionRequest: (request: GeminiAcpPermissionRequest) => Promise<unknown>;
  readonly onClose: (input: {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stderr: string;
    readonly error?: Error | undefined;
  }) => void;
  readonly onProtocolError?: ((error: Error) => void) | undefined;
}

/**
 * A JSON-RPC 2.0 client that communicates with a Gemini CLI child process
 * over `stdin`/`stdout` using newline-delimited JSON.
 *
 * Instances are created exclusively through the {@link JsonRpcStdioClient.start}
 * factory which spawns the child process, performs the ACP `initialize`
 * handshake, and returns a ready-to-use client.
 *
 * @internal
 */
export class JsonRpcStdioClient {
  readonly child: ChildProcessWithoutNullStreams;
  readonly output: readline.Interface;
  readonly cwd: string;

  #pending = new Map<string, PendingRequest>();
  #notificationsEnabled = false;
  #nextRequestId = 1;
  #stderr = "";
  #closed = false;
  #closedPromise: Promise<void>;
  #resolveClosed!: () => void;
  private handlers: ClientHandlers;
  private logger?: GeminiLogger;

  /** Constructs a new client wrapping the given child process. */
  private constructor(
    child: ChildProcessWithoutNullStreams,
    cwd: string,
    handlers: ClientHandlers,
    logger?: GeminiLogger
  ) {
    this.child = child;
    this.cwd = cwd;
    this.handlers = handlers;
    this.logger = logger;
    this.output = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });
    this.#closedPromise = new Promise<void>((resolve) => {
      this.#resolveClosed = resolve;
    });
    this.attachListeners();
  }

  /**
   * Spawns a Gemini CLI child process, performs the ACP `initialize`
   * handshake, and returns a fully initialised client.
   *
   * @param input - Spawn configuration and event-handler callbacks.
   * @returns A connected {@link JsonRpcStdioClient} ready to send requests.
   * @throws {GeminiProcessError} If the child process fails to start or the
   *   `initialize` handshake does not complete successfully.
   */
  static async start(input: {
    readonly binaryPath: string;
    readonly args?: readonly string[] | undefined;
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv | undefined;
    readonly onSessionUpdate: (envelope: GeminiAcpNotificationEnvelope) => void;
    readonly onPermissionRequest: (request: GeminiAcpPermissionRequest) => Promise<unknown>;
    readonly onClose: (input: {
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
      readonly stderr: string;
      readonly error?: Error | undefined;
    }) => void;
    readonly onProtocolError?: ((error: Error) => void) | undefined;
    readonly logger?: GeminiLogger | undefined;
  }) {
    const spawnArgs = [...(input.args ?? []), "--acp"];
    input.logger?.info?.("Spawning Gemini CLI with ACP protocol...", { args: spawnArgs });

    const child = spawn(input.binaryPath, spawnArgs, {
      cwd: input.cwd,
      ...(input.env ? { env: input.env } : {}),
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const client = new JsonRpcStdioClient(
      child,
      input.cwd,
      {
        onSessionUpdate: input.onSessionUpdate,
        onPermissionRequest: input.onPermissionRequest,
        onClose: input.onClose,
        ...(input.onProtocolError ? { onProtocolError: input.onProtocolError } : {}),
      },
      input.logger
    );

    try {
      input.logger?.debug?.("Sending initialize request...");
      await client.request<GeminiAcpInitializeResponse>(
        ACP_METHOD_INITIALIZE,
        {
          protocolVersion: ACP_PROTOCOL_VERSION,
          clientInfo: {
            name: "gemini-acp",
            title: "gemini-acp",
            version: LIB_VERSION,
          },
          clientCapabilities: {},
        },
        DEFAULT_REQUEST_TIMEOUT_MS
      );
      input.logger?.info?.("Gemini CLI initialized successfully");
      client.setNotificationsEnabled(true);
      return client;
    } catch (error) {
      input.logger?.error?.(
        "Failed to initialize Gemini CLI",
        error instanceof Error ? error.message : String(error)
      );
      await client.stop();
      throw new GeminiProcessError(
        toMessage(error, "Failed to initialize Gemini CLI"),
        { cause: error }
      );
    }
  }

  /** Accumulated stderr output from the child process. */
  get stderr(): string {
    return this.#stderr;
  }

  /** A promise that resolves once the child process has exited. */
  get closed(): Promise<void> {
    return this.#closedPromise;
  }

  /** Whether the child process has already exited. */
  get isClosed(): boolean {
    return this.#closed;
  }

  /**
   * Sends a JSON-RPC request and waits for the corresponding response.
   *
   * @param method - The JSON-RPC method name.
   * @param params - Parameters to include in the request.
   * @param timeoutMs - Optional timeout in milliseconds after which a
   *   {@link GeminiTimeoutError} is thrown.
   * @returns The `result` field of the JSON-RPC response.
   * @throws {GeminiProcessError} If the client is already closed or the
   *   message cannot be written to stdin.
   * @throws {GeminiTimeoutError} If the request exceeds `timeoutMs`.
   * @throws {GeminiRequestError} If the server responds with a JSON-RPC error.
   */
  async request<TResponse>(
    method: string,
    params: unknown,
    timeoutMs?: number
  ): Promise<TResponse> {
    if (this.#closed) {
      throw new GeminiProcessError("Gemini ACP process is already closed.");
    }

    const id = String(this.#nextRequestId++);
    const message: JsonRpcRequestMessage = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };

    return await new Promise<TResponse>((resolve, reject) => {
      const timeout =
        timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              this.#pending.delete(id);
              const error = new GeminiTimeoutError(`Gemini ACP request timed out: ${method}`);
              this.logger?.warn?.(`Request timeout: ${method}`);
              reject(error);
            }, timeoutMs);

      this.#pending.set(id, {
        resolve: (value) => resolve(value as TResponse),
        reject,
        ...(timeout ? { timeout } : {}),
      });

      try {
        this.logger?.debug?.(`Sending request: ${method}`, { id });
        this.writeMessage(message);
      } catch (error) {
        if (timeout) {
          clearTimeout(timeout);
        }
        this.#pending.delete(id);
        reject(error instanceof Error ? error : new GeminiProcessError(String(error)));
      }
    });
  }

  /**
   * Sends a JSON-RPC notification (a message with no `id` that expects no
   * response).
   *
   * @param method - The JSON-RPC method name.
   * @param params - Parameters to include in the notification.
   */
  notify(method: string, params: unknown): void {
    if (this.#closed) {
      this.logger?.warn?.("Cannot send notification; client is closed");
      return;
    }
    const message: JsonRpcNotificationMessage = {
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    };
    this.logger?.debug?.(`Sending notification: ${method}`);
    this.writeMessage(message);
  }

  /** Enables or disables delivery of session-update notifications. */
  setNotificationsEnabled(enabled: boolean) {
    this.#notificationsEnabled = enabled;
    this.logger?.debug?.(`Notifications ${enabled ? "enabled" : "disabled"}`);
  }

  /** Gracefully stops the child process (SIGTERM with a SIGKILL fallback). */
  async stop(): Promise<void> {
    if (this.#closed) {
      await this.#closedPromise;
      return;
    }
    this.logger?.info?.("Stopping Gemini ACP client...");
    this.child.kill("SIGTERM");

    // SIGKILL fallback if SIGTERM doesn't work within 5s
    const killTimeout = setTimeout(() => {
      if (!this.#closed) {
        this.logger?.warn?.("SIGTERM did not stop process, sending SIGKILL");
        this.child.kill("SIGKILL");
      }
    }, 5_000);

    await this.#closedPromise;
    clearTimeout(killTimeout);
    this.logger?.info?.("Gemini ACP client stopped");
  }

  /** Wires up stdout, stderr, error, and close listeners on the child process. */
  private attachListeners() {
    this.output.on("line", (line) => {
      void this.handleLine(line).catch((error) => {
        this.logger?.error?.(
          "Unhandled error processing line",
          error instanceof Error ? error.message : String(error),
        );
      });
    });

    this.child.stderr.on("data", (chunk: Buffer | string) => {
      this.#stderr = `${this.#stderr}${chunk.toString()}`.slice(-MAX_STDERR_CHARS);
    });

    this.child.once("error", (error) => {
      this.logger?.error?.("Child process error", error.message);
      this.handleClose({
        code: null,
        signal: null,
        stderr: this.#stderr,
        error,
      });
    });

    this.child.once("close", (code, signal) => {
      this.logger?.info?.("Child process closed", { code, signal });
      this.handleClose({
        code,
        signal,
        stderr: this.#stderr,
      });
    });
  }

  /** Parses a single line of stdout as a JSON-RPC message and dispatches it. */
  private async handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let message: JsonRpcMessage;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== "object" || parsed === null) {
        return; // ignore non-object values (e.g. bare numbers from CLI debug output)
      }
      message = parsed as JsonRpcMessage;
    } catch (error) {
      const protocolError = new GeminiProtocolError(
        `Received invalid Gemini ACP JSON line: ${toMessage(error, "parse failure")}`,
        { cause: error }
      );
      this.logger?.error?.(
        "Protocol error",
        protocolError.message
      );
      this.handlers.onProtocolError?.(protocolError);
      return;
    }

    if ("id" in message && ("result" in message || "error" in message)) {
      const pending = this.#pending.get(String(message.id));
      if (!pending) {
        this.logger?.debug?.(`Received response for unknown request: ${message.id}`);
        return;
      }
      this.#pending.delete(String(message.id));
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      if ("error" in message) {
        const err: unknown = message.error;
        const errObj = (err && typeof err === "object") ? err as Record<string, unknown> : undefined;
        const errMsg = (errObj && typeof errObj.message === "string") ? errObj.message : "Unknown ACP error";
        const errCode = (errObj && typeof errObj.code === "number") ? errObj.code : -1;
        const errData = errObj?.data;
        this.logger?.debug?.(`Request ${message.id} failed: ${errMsg}`);
        pending.reject(new GeminiRequestError(
          errMsg,
          errCode,
          errData ? { metadata: { data: errData } } : undefined,
        ));
      } else {
        this.logger?.debug?.(`Request ${message.id} succeeded`);
        pending.resolve(message.result);
      }
      return;
    }

    if ("method" in message && "id" in message) {
      try {
        const result = await this.handleRequest(message.method, message.params);
        this.writeMessage({
          jsonrpc: "2.0",
          id: message.id,
          result: result ?? {},
        } satisfies JsonRpcResponseMessage);
      } catch (error) {
        const messageText = toMessage(
          error,
          `Gemini ACP request failed: ${message.method}`
        );
        this.logger?.error?.(messageText);
        this.writeMessage({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32603,
            message: messageText,
          },
        } satisfies JsonRpcResponseMessage);
      }
      return;
    }

    if ("method" in message) {
      this.handleNotification(message.method, message.params);
    }
  }

  /** Handles an incoming JSON-RPC request from the child process. */
  private async handleRequest(method: string, params: unknown): Promise<unknown> {
    if (method === ACP_METHOD_SESSION_REQUEST_PERMISSION) {
      this.logger?.debug?.("Permission request received");
      return await this.handlers.onPermissionRequest((params ?? {}) as GeminiAcpPermissionRequest);
    }
    throw new GeminiProtocolError(`Unsupported Gemini ACP client request: ${method}`);
  }

  /** Handles an incoming JSON-RPC notification from the child process. */
  private handleNotification(method: string, params: unknown): void {
    if (method !== ACP_METHOD_SESSION_UPDATE || !this.#notificationsEnabled) {
      return;
    }
    const envelope = (params ?? {}) as GeminiAcpNotificationEnvelope;
    if (!envelope.update) {
      return;
    }
    this.logger?.debug?.(`Session update received: ${envelope.update.sessionUpdate}`, {
      sessionId: envelope.sessionId,
    });
    this.handlers.onSessionUpdate(envelope);
  }

  /** Serialises and writes a JSON-RPC message to the child process stdin. */
  private writeMessage(message: JsonRpcMessage): void {
    if (this.#closed || !this.child.stdin.writable) {
      throw new GeminiProcessError("Cannot write to Gemini ACP stdin.");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  /** Cleans up state and rejects pending requests when the child process exits. */
  private handleClose(input: {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stderr: string;
    readonly error?: Error | undefined;
  }) {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.output.close();

    // Reject all pending requests
    for (const [id, pending] of this.#pending) {
      this.#pending.delete(id);
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(
        input.error ??
          new GeminiProcessError(
            input.stderr.trim() ||
              `Gemini ACP process exited (code=${input.code ?? "null"}, signal=${input.signal ?? "null"}).`
          )
      );
    }

    this.handlers.onClose(input);
    this.#resolveClosed();
  }
}
