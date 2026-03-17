import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_STDERR_CHARS,
  ACP_METHOD_INITIALIZE,
  ACP_PROTOCOL_VERSION,
} from "./constants";
import {
  type JsonRpcMessage,
  type JsonRpcRequestMessage,
  type JsonRpcNotificationMessage,
  type JsonRpcResponseMessage,
  type GeminiAcpInitializeResponse,
  type GeminiAcpNotificationEnvelope,
  type GeminiAcpPermissionRequest,
  type GeminiLogger,
} from "./types";
import { GeminiProcessError, GeminiProtocolError, GeminiTimeoutError } from "./errors";
import { toMessage } from "./utils";

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout?: ReturnType<typeof setTimeout> | undefined;
}

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

  static async start(input: {
    readonly binaryPath: string;
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
    input.logger?.info?.("Spawning Gemini CLI with ACP protocol...");

    const child = spawn(input.binaryPath, ["--acp"], {
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
            version: "0.1.0",
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
        error
      );
    }
  }

  get stderr(): string {
    return this.#stderr;
  }

  get closed(): Promise<void> {
    return this.#closedPromise;
  }

  get isClosed(): boolean {
    return this.#closed;
  }

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

  setNotificationsEnabled(enabled: boolean) {
    this.#notificationsEnabled = enabled;
    this.logger?.debug?.(`Notifications ${enabled ? "enabled" : "disabled"}`);
  }

  async stop(): Promise<void> {
    if (this.#closed) {
      await this.#closedPromise;
      return;
    }
    this.logger?.info?.("Stopping Gemini ACP client...");
    this.child.kill("SIGTERM");
    await this.#closedPromise;
    this.logger?.info?.("Gemini ACP client stopped");
  }

  private attachListeners() {
    this.output.on("line", (line) => {
      void this.handleLine(line);
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

  private async handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let message: JsonRpcMessage;
    try {
      message = JSON.parse(trimmed) as JsonRpcMessage;
    } catch (error) {
      const protocolError = new GeminiProtocolError(
        `Received invalid Gemini ACP JSON line: ${toMessage(error, "parse failure")}`,
        error
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
        this.logger?.debug?.(`Request ${message.id} failed: ${message.error.message}`);
        pending.reject(new GeminiProtocolError(message.error.message));
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

  private async handleRequest(method: string, params: unknown): Promise<unknown> {
    if (method === "session/request_permission") {
      this.logger?.debug?.("Permission request received");
      return await this.handlers.onPermissionRequest((params ?? {}) as GeminiAcpPermissionRequest);
    }
    throw new GeminiProtocolError(`Unsupported Gemini ACP client request: ${method}`);
  }

  private handleNotification(method: string, params: unknown): void {
    if (method !== "session/update" || !this.#notificationsEnabled) {
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

  private writeMessage(message: JsonRpcMessage): void {
    if (this.#closed || !this.child.stdin.writable) {
      throw new GeminiProcessError("Cannot write to Gemini ACP stdin.");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

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
