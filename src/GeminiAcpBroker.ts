import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  ACP_METHOD_SESSION_NEW,
  ACP_METHOD_SESSION_LOAD,
  ACP_METHOD_SESSION_SET_MODE,
  ACP_METHOD_SESSION_SET_MODEL,
  ACP_METHOD_SESSION_PROMPT,
  ACP_METHOD_SESSION_CANCEL,
} from "./constants.js";
import {
  type GeminiAcpSessionResponse,
  type GeminiAcpNotificationEnvelope,
  type GeminiAcpPermissionRequest,
  type GeminiSessionUpdate,
  type GeminiContentBlock,
  type GeminiAcpPromptResponse,
  type GeminiMcpServer,
  type GeminiLogger,
} from "./types.js";
import { JsonRpcStdioClient } from "./JsonRpcStdioClient.js";
import { GeminiProtocolError } from "./errors.js";
import { readSessionId, readSessionModelId, trimToUndefined } from "./utils.js";

/**
 * Routing callbacks for a single ACP session.
 *
 * Each active session is associated with exactly one {@link BrokerRoute} so
 * the broker can dispatch notifications and lifecycle events to the correct
 * consumer.
 *
 * @internal
 */
interface BrokerRoute {
  /** Called whenever the agent pushes a streaming session update. */
  readonly onSessionUpdate: (update: GeminiSessionUpdate) => void;
  /** Called when the agent requests permission (e.g. tool-use approval). Must resolve with the permission outcome. */
  readonly onPermissionRequest: (request: GeminiAcpPermissionRequest) => Promise<unknown>;
  /** Called when the broker's underlying transport closes (gracefully or due to error). */
  readonly onBrokerClose: (input: {
    /** Process exit code, or `null` if terminated by signal. */
    readonly code: number | null;
    /** Signal that terminated the process, or `null` if it exited normally. */
    readonly signal: NodeJS.Signals | null;
    /** Captured stderr output from the child process. */
    readonly stderr: string;
    /** Optional error that caused the close. */
    readonly error?: Error | undefined;
  }) => void;
}

/**
 * High-level broker that manages one or more Gemini ACP sessions over a
 * single JSON-RPC stdio transport.
 *
 * Use the static {@link GeminiAcpBroker.start} factory to spawn the
 * underlying child process and obtain a ready-to-use broker instance.
 *
 * @internal
 */
export class GeminiAcpBroker {
  /** Absolute path to the ACP agent binary. */
  readonly binaryPath: string;
  /** Working directory passed to the child process on startup. */
  readonly cwd: string;

  #routes = new Map<string, BrokerRoute>();

  private constructor(
    private readonly client: JsonRpcStdioClient,
    input: {
      readonly binaryPath: string;
      readonly cwd: string;
    },
    private logger?: GeminiLogger
  ) {
    this.binaryPath = input.binaryPath;
    this.cwd = input.cwd;
  }

  /**
   * Spawn the ACP agent binary and return a connected broker.
   *
   * @param input - Startup configuration.
   * @param input.binaryPath - Absolute path to the ACP agent binary.
   * @param input.cwd - Working directory for the child process.
   * @param input.env - Optional environment variables forwarded to the child process.
   * @param input.onProtocolError - Optional callback invoked on JSON-RPC protocol errors.
   * @param input.logger - Optional structured logger.
   * @returns A fully initialised {@link GeminiAcpBroker} instance.
   * @throws If the child process fails to start or the initial handshake times out.
   */
  static async start(input: {
    readonly binaryPath: string;
    readonly args?: readonly string[] | undefined;
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv | undefined;
    readonly onProtocolError?: ((error: Error) => void) | undefined;
    readonly logger?: GeminiLogger | undefined;
  }) {
    // eslint-disable-next-line prefer-const
    let broker: GeminiAcpBroker | undefined;
    const client = await JsonRpcStdioClient.start({
      binaryPath: input.binaryPath,
      args: input.args,
      cwd: input.cwd,
      ...(input.env ? { env: input.env } : {}),
      onSessionUpdate: (envelope) => broker?.handleSessionUpdate(envelope),
      onPermissionRequest: async (request) => await broker?.handlePermissionRequest(request),
      onClose: (closeInput) => broker?.handleClose(closeInput),
      ...(input.onProtocolError ? { onProtocolError: input.onProtocolError } : {}),
      ...(input.logger ? { logger: input.logger } : {}),
    });
    broker = new GeminiAcpBroker(client, input, input.logger);
    return broker;
  }

  /** Accumulated stderr output from the child process. */
  get stderr(): string {
    return this.client.stderr;
  }

  /** Whether the underlying transport has been closed. */
  get isClosed(): boolean {
    return this.client.isClosed;
  }

  /** Promise that resolves once the transport has fully closed. */
  get closed(): Promise<void> {
    return this.client.closed;
  }

  /**
   * Open (or resume) an ACP session, set its initial mode, and optionally
   * override the model.
   *
   * @param input - Session configuration.
   * @param input.cwd - Working directory for the session.
   * @param input.mode - Operating mode: `"yolo"` (auto-approve) or `"plan"` (manual approval).
   * @param input.createRoute - Factory called with the session ID to create the {@link BrokerRoute} callbacks.
   * @param input.resumeSessionId - If provided, the broker loads an existing session instead of creating a new one.
   * @param input.model - Optional model identifier to set on the session.
   * @param input.mcpServers - Optional list of MCP servers to attach to the session.
   * @returns An object containing the `sessionId` and the resolved `currentModel`.
   * @throws {GeminiProtocolError} If a new session response does not include a session ID.
   * @throws If the underlying JSON-RPC request fails or times out.
   */
  async openSession(input: {
    readonly cwd: string;
    readonly mode: "yolo" | "plan";
    readonly createRoute: (sessionId: string) => BrokerRoute;
    readonly resumeSessionId?: string | undefined;
    readonly model?: string | undefined;
    readonly mcpServers?: readonly GeminiMcpServer[] | undefined;
  }) {
    let sessionId: string;
    let currentModel: string | undefined;
    let routeRegistered = false;
    let route: BrokerRoute | undefined;

    const mcpServers = input.mcpServers ?? [];

    try {
      if (input.resumeSessionId) {
        this.logger?.debug?.("Loading existing session...", { sessionId: input.resumeSessionId });
        sessionId = input.resumeSessionId;
        route = input.createRoute(sessionId);
        this.#routes.set(sessionId, route);
        routeRegistered = true;
        const response = await this.client.request<GeminiAcpSessionResponse>(
          ACP_METHOD_SESSION_LOAD,
          {
            sessionId: input.resumeSessionId,
            cwd: input.cwd,
            mcpServers,
          },
          DEFAULT_REQUEST_TIMEOUT_MS
        );
        currentModel = readSessionModelId(response) ?? input.model;
      } else {
        this.logger?.debug?.("Creating new session...");
        const response = await this.client.request<GeminiAcpSessionResponse>(
          ACP_METHOD_SESSION_NEW,
          {
            cwd: input.cwd,
            mcpServers,
          },
          DEFAULT_REQUEST_TIMEOUT_MS
        );
        const newSessionId = readSessionId(response);
        if (!newSessionId) {
          throw new GeminiProtocolError("Gemini ACP session/new did not return a session id.");
        }
        sessionId = newSessionId;
        this.logger?.debug?.("New session created", { sessionId });
        route = input.createRoute(sessionId);
        this.#routes.set(sessionId, route);
        routeRegistered = true;
        currentModel = readSessionModelId(response) ?? input.model;
      }

      // Set initial mode
      const modeId = input.mode === "plan" ? "plan" : "yolo";
      this.logger?.debug?.("Setting session mode...", { sessionId, modeId });
      await this.client.request(
        ACP_METHOD_SESSION_SET_MODE,
        {
          sessionId,
          modeId,
        },
        DEFAULT_REQUEST_TIMEOUT_MS
      );

      // Set model if provided
      if (input.model) {
        this.logger?.debug?.("Setting session model...", { sessionId, model: input.model });
        await this.client.request(
          ACP_METHOD_SESSION_SET_MODEL,
          {
            sessionId,
            modelId: input.model,
          },
          DEFAULT_REQUEST_TIMEOUT_MS
        );
        currentModel = input.model;
      }

      return {
        sessionId,
        currentModel,
      };
    } catch (error) {
      if (routeRegistered && sessionId!) {
        this.#routes.delete(sessionId);
      }
      this.logger?.error?.("Failed to open session", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Change the operating mode of an active session.
   *
   * @param sessionId - Target session identifier.
   * @param modeId - New mode: `"yolo"` or `"plan"`.
   * @throws If the underlying JSON-RPC request fails or times out.
   */
  async setMode(sessionId: string, modeId: "yolo" | "plan") {
    this.logger?.debug?.("Setting mode...", { sessionId, modeId });
    await this.client.request(
      ACP_METHOD_SESSION_SET_MODE,
      {
        sessionId,
        modeId,
      },
      DEFAULT_REQUEST_TIMEOUT_MS
    );
  }

  /**
   * Switch the model used by an active session.
   *
   * @param sessionId - Target session identifier.
   * @param modelId - Model identifier to switch to.
   * @throws If the underlying JSON-RPC request fails or times out.
   */
  async setModel(sessionId: string, modelId: string) {
    this.logger?.debug?.("Setting model...", { sessionId, modelId });
    await this.client.request(
      ACP_METHOD_SESSION_SET_MODEL,
      {
        sessionId,
        modelId,
      },
      DEFAULT_REQUEST_TIMEOUT_MS
    );
  }

  /**
   * Send a prompt to an active session and wait for the agent's response.
   *
   * @param sessionId - Target session identifier.
   * @param prompt - Content blocks that make up the prompt.
   * @param timeoutMs - Optional request timeout in milliseconds (server default if omitted).
   * @returns The agent's prompt response.
   * @throws If the underlying JSON-RPC request fails or times out.
   */
  async prompt(sessionId: string, prompt: readonly GeminiContentBlock[], timeoutMs?: number) {
    this.logger?.debug?.("Sending prompt...", { sessionId, blockCount: prompt.length });
    return await this.client.request<GeminiAcpPromptResponse>(
      ACP_METHOD_SESSION_PROMPT,
      {
        sessionId,
        prompt,
      },
      timeoutMs,
    );
  }

  /**
   * Fire-and-forget cancellation of the current turn for a session.
   *
   * @param sessionId - Target session identifier.
   */
  cancel(sessionId: string) {
    this.logger?.debug?.("Cancelling session...", { sessionId });
    this.client.notify(ACP_METHOD_SESSION_CANCEL, {
      sessionId,
    });
  }

  /**
   * Register a {@link BrokerRoute} for a session, replacing any existing route.
   *
   * @param sessionId - Target session identifier.
   * @param route - Callbacks to associate with the session.
   */
  bindSession(sessionId: string, route: BrokerRoute) {
    this.logger?.debug?.("Binding session route...", { sessionId });
    this.#routes.set(sessionId, route);
  }

  /**
   * Remove the {@link BrokerRoute} for a session so it no longer receives events.
   *
   * @param sessionId - Session identifier to release.
   */
  releaseSession(sessionId: string) {
    this.logger?.debug?.("Releasing session route...", { sessionId });
    this.#routes.delete(sessionId);
  }

  /**
   * Send an arbitrary JSON-RPC request through the broker's transport.
   *
   * Prefer the typed helpers ({@link prompt}, {@link setMode}, etc.) for
   * standard ACP methods. Use this only for custom or experimental methods.
   */
  async rawRequest<T = unknown>(method: string, params: unknown, timeoutMs?: number): Promise<T> {
    return await this.client.request<T>(method, params, timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  }

  /** Gracefully shut down the broker and its underlying child process. */
  async stop() {
    this.logger?.info?.("Stopping broker...");
    await this.client.stop();
  }

  /** Dispatch a session update notification to the matching route. */
  private handleSessionUpdate(envelope: GeminiAcpNotificationEnvelope) {
    const sessionId = trimToUndefined(envelope.sessionId);
    const update = envelope.update;
    if (!sessionId || !update) {
      return;
    }
    this.#routes.get(sessionId)?.onSessionUpdate(update);
  }

  /** Forward a permission request to the session's route, falling back to cancellation on error. */
  private async handlePermissionRequest(request: GeminiAcpPermissionRequest) {
    const sessionId = trimToUndefined(request.sessionId);
    const route = sessionId ? this.#routes.get(sessionId) : undefined;
    if (!route) {
      this.logger?.warn?.("Permission request for unknown session", { sessionId });
      return {
        outcome: {
          outcome: "cancelled" as const,
        },
      };
    }
    try {
      return await route.onPermissionRequest(request);
    } catch (error) {
      this.logger?.error?.(
        "Permission handler threw, cancelling",
        error instanceof Error ? error.message : String(error),
      );
      return {
        outcome: {
          outcome: "cancelled" as const,
        },
      };
    }
  }

  /** Notify all active routes that the broker connection has closed, then clear the routing table. */
  private handleClose(input: {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stderr: string;
    readonly error?: Error | undefined;
  }) {
    this.logger?.error?.("Broker connection closed", {
      code: input.code,
      signal: input.signal,
      hasError: !!input.error,
    });
    const routes = Array.from(this.#routes.values());
    this.#routes.clear();
    for (const route of routes) {
      route.onBrokerClose(input);
    }
  }
}
