import {
  type GeminiClient,
  type GeminiClientOptions,
  type GeminiSession,
  type GeminiSessionOptions,
  type GeminiLogger,
  type GeminiClientEvent,
  type GeminiMcpServer,
  type PermissionHandler,
  type GeminiAcpPermissionRequest,
} from "./types.js";
import { GeminiAcpBroker } from "./GeminiAcpBroker.js";
import { GeminiSessionImpl } from "./GeminiSessionImpl.js";
import { GeminiProcessError } from "./errors.js";
import { trimToUndefined } from "./utils.js";

/**
 * Holds the metadata for a pre-opened "warm" session that can be
 * handed to the next {@link GeminiClientImpl.openSession} call to
 * skip the session-creation latency.
 *
 * @internal
 */
interface GeminiWarmSession {
  readonly sessionId: string;
  readonly cwd: string;
  readonly binaryPath: string;
}

/**
 * Concrete implementation of the {@link GeminiClient} interface.
 *
 * Manages the lifecycle of a single Gemini CLI broker process and
 * multiplexes sessions over it.  Use the factory function
 * {@link createGeminiClient} (or the static {@link create} method)
 * to obtain an instance.
 *
 * @internal
 */
export class GeminiClientImpl implements GeminiClient {
  #broker: GeminiAcpBroker | undefined;
  #brokerPending: Promise<GeminiAcpBroker> | undefined;
  #sessions = new Map<string, GeminiSessionImpl>();
  #warmSession: GeminiWarmSession | undefined;
  #warmSessionPending: Promise<void> | undefined;
  #warmTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  private binaryPath: string;
  private cwd: string;
  private env?: NodeJS.ProcessEnv;
  private logger?: GeminiLogger;
  private onProtocolError?: (error: Error) => void;
  private onEvent?: (event: GeminiClientEvent) => void;
  private defaultOnPermissionRequest?: PermissionHandler;
  private defaultMcpServers: readonly GeminiMcpServer[];
  private defaultPromptTimeoutMs: number | undefined;
  private warmStart: boolean;
  private warmStartTimeoutMs: number;

  /** Initialise instance fields from the provided options. */
  private constructor(options: GeminiClientOptions) {
    this.binaryPath = options.binaryPath ?? "gemini";
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env;
    this.logger = options.logger;
    this.onProtocolError = options.onProtocolError;
    this.onEvent = options.onEvent;
    this.defaultOnPermissionRequest = options.onPermissionRequest;
    this.defaultMcpServers = options.mcpServers ?? [];
    this.defaultPromptTimeoutMs = options.promptTimeoutMs;
    this.warmStart = options.warmStart ?? false;
    this.warmStartTimeoutMs = options.warmStartTimeoutMs ?? 30_000;
  }

  /**
   * Create a new client, start the broker, and optionally warm-start
   * a session in the background.
   *
   * @param options - Client configuration. All fields are optional.
   * @returns A fully-initialised client with its broker running.
   * @throws {GeminiProcessError} If the broker fails to start.
   */
  static async create(options?: GeminiClientOptions): Promise<GeminiClientImpl> {
    const client = new GeminiClientImpl(options ?? {});
    await client.ensureBroker();
    
    if (client.warmStart) {
      client.logger?.info?.("Starting warm session...");
      void client.startWarmSession().catch((error) => {
        client.logger?.warn?.("Failed to warm start session", error instanceof Error ? error.message : String(error));
      });
    }
    
    return client;
  }

  /**
   * Open a new session (or resume an existing one).
   *
   * If a warm session is available and compatible, it is consumed
   * instead of creating a new one, and a replacement warm session
   * is started in the background.
   *
   * @param options - Session configuration. All fields are optional.
   * @returns The opened (or resumed) session.
   * @throws {GeminiProcessError} If the client is closed or the broker cannot start.
   */
  async openSession(options?: GeminiSessionOptions): Promise<GeminiSession> {
    if (this.#closed) {
      throw new GeminiProcessError("Client is closed");
    }

    const opts = options ?? {};
    const broker = await this.ensureBroker();

    const cwd = trimToUndefined(opts.cwd) ?? this.cwd;
    const mode = opts.mode ?? "yolo";

    this.logger?.debug?.("Opening session...", { cwd, mode, model: opts.model });

    try {
      // Check if we can use the warm session
      if (
        this.#warmSession &&
        this.#warmSession.cwd === cwd &&
        this.#warmSession.binaryPath === this.binaryPath &&
        !opts.resumeSessionId
      ) {
        return await this.takeWarmSession(this.#warmSession, broker, opts, mode);
      }

      // Regular session opening
      return await this.openNewSession(broker, opts, cwd, mode);
    } catch (error) {
      this.logger?.error?.(
        "Failed to open session",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Send a raw ACP JSON-RPC request to the broker.
   *
   * @typeParam T - The expected response type (not runtime-validated).
   * @param method - The ACP method name (e.g. `"session/some_new_method"`).
   * @param params - The method parameters.
   * @param timeoutMs - Optional request timeout in milliseconds.
   * @returns The parsed response.
   * @throws {GeminiProcessError} If the client is closed.
   * @throws {GeminiTimeoutError} If the request times out.
   * @throws {GeminiRequestError} If the ACP method returns an error.
   */
  async rawRequest<T = unknown>(method: string, params: unknown, timeoutMs?: number): Promise<T> {
    if (this.#closed) {
      throw new GeminiProcessError("Client is closed");
    }
    const broker = await this.ensureBroker();
    return await broker.rawRequest<T>(method, params, timeoutMs);
  }

  /** Dispatch a client event, swallowing any handler errors. */
  private emit(event: GeminiClientEvent): void {
    try {
      this.onEvent?.(event);
    } catch {
      // Never let event handler errors propagate
    }
  }

  /** Build a permission callback that emits events around the resolved handler. */
  private resolvePermissionHandler(sessionId: string, sessionHandler?: PermissionHandler): (request: GeminiAcpPermissionRequest) => Promise<unknown> {
    const handler = sessionHandler ?? this.defaultOnPermissionRequest;
    return async (request) => {
      this.emit({ type: "permission_requested", sessionId });
      if (!handler) {
        this.emit({ type: "permission_resolved", sessionId, outcome: "cancelled" });
        return { outcome: { outcome: "cancelled" } };
      }
      const result = await handler(request);
      this.emit({ type: "permission_resolved", sessionId, outcome: result.outcome.outcome });
      return result;
    };
  }

  /** Open a brand-new session via the broker and register it. */
  private async openNewSession(
    broker: GeminiAcpBroker,
    options: GeminiSessionOptions,
    cwd: string,
    mode: "yolo" | "plan",
  ): Promise<GeminiSession> {
    let createdSession: GeminiSessionImpl | undefined;
    let createdSessionId: string | undefined;
    const promptTimeoutMs = options.promptTimeoutMs ?? this.defaultPromptTimeoutMs;
    const mcpServers = options.mcpServers ?? this.defaultMcpServers;

    try {
      const result = await broker.openSession({
        cwd,
        mode,
        resumeSessionId: options.resumeSessionId,
        model: options.model,
        mcpServers,
        createRoute: (sessionId: string) => {
          createdSessionId = sessionId;
          createdSession = GeminiSessionImpl.create(sessionId, broker, undefined, this.logger, {
            promptTimeoutMs,
            onEvent: this.onEvent,
            onDispose: (id) => {
              this.#sessions.delete(id);
              this.emit({ type: "session_closed", sessionId: id });
            },
          });
          this.#sessions.set(sessionId, createdSession);
          return {
            onSessionUpdate: (update) => createdSession!.handleUpdate(update),
            onPermissionRequest: this.resolvePermissionHandler(sessionId, options.onPermissionRequest),
            onBrokerClose: (closeInput) => {
              createdSession!.handleBrokerClose(closeInput);
            },
          };
        },
      });

      // Propagate currentModel from broker result
      const session = this.#sessions.get(result.sessionId)!;
      session.setCurrentModel(result.currentModel);
      this.emit({ type: "session_opened", sessionId: result.sessionId, model: result.currentModel, warm: false });
      this.logger?.info?.("Session opened", { sessionId: result.sessionId, model: result.currentModel });
      return session;
    } catch (error) {
      // Clean up partially created session on failure
      if (createdSessionId) {
        this.#sessions.delete(createdSessionId);
      }
      throw error;
    }
  }

  /** Consume a pre-opened warm session, rebind it, and apply options. */
  private async takeWarmSession(
    warm: GeminiWarmSession,
    broker: GeminiAcpBroker,
    options: GeminiSessionOptions,
    mode: "yolo" | "plan",
  ): Promise<GeminiSession> {
    const sessionId = warm.sessionId;
    this.logger?.debug?.("Taking warm session", { sessionId });
    this.#warmSession = undefined;
    this.emit({ type: "warm_session_consumed", sessionId });

    const promptTimeoutMs = options.promptTimeoutMs ?? this.defaultPromptTimeoutMs;

    // Create a real session and rebind the broker route to it
    const session = GeminiSessionImpl.create(sessionId, broker, undefined, this.logger, {
      promptTimeoutMs,
      onEvent: this.onEvent,
      onDispose: (id) => {
        this.#sessions.delete(id);
        this.emit({ type: "session_closed", sessionId: id });
      },
    });
    this.#sessions.set(sessionId, session);

    broker.bindSession(sessionId, {
      onSessionUpdate: (update) => session.handleUpdate(update),
      onPermissionRequest: this.resolvePermissionHandler(sessionId, options.onPermissionRequest),
      onBrokerClose: (closeInput) => {
        session.handleBrokerClose(closeInput);
      },
    });

    // Apply requested mode and model via ACP RPCs
    try {
      await broker.setMode(sessionId, mode);
    } catch (error) {
      this.logger?.warn?.("Failed to set mode on warm session", error instanceof Error ? error.message : String(error));
    }

    if (options.model) {
      try {
        await broker.setModel(sessionId, options.model);
        session.setCurrentModel(options.model);
      } catch (error) {
        this.logger?.warn?.("Failed to set model on warm session", error instanceof Error ? error.message : String(error));
      }
    }

    // Start another warm session in the background
    void this.startWarmSession().catch((error) => {
      this.logger?.warn?.("Failed to restart warm session", error instanceof Error ? error.message : String(error));
    });

    this.emit({ type: "session_opened", sessionId, model: session.currentModel, warm: true });
    this.logger?.info?.("Session opened", { sessionId, model: session.currentModel, fromWarm: true });
    return session;
  }

  /**
   * Gracefully shut down the client: cancel warm sessions, close all
   * active sessions, and stop the broker process.
   */
  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.logger?.info?.("Closing client...");
    this.#closed = true;

    // Cancel any warm-start timeout
    if (this.#warmTimeoutHandle) {
      clearTimeout(this.#warmTimeoutHandle);
      this.#warmTimeoutHandle = undefined;
    }

    // Close warm session
    if (this.#warmSession) {
      try {
        this.#broker?.releaseSession(this.#warmSession.sessionId);
      } catch {
        // Ignore errors during cleanup
      }
      this.#warmSession = undefined;
    }

    // Close all sessions
    for (const session of this.#sessions.values()) {
      try {
        await session.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.#sessions.clear();

    // Stop broker
    if (this.#broker) {
      try {
        await this.#broker.stop();
      } catch {
        // Ignore errors during cleanup
      }
    }

    this.logger?.info?.("Client closed");
  }

  get closed(): Promise<void> {
    if (!this.#broker) {
      return Promise.resolve();
    }
    return this.#broker.closed;
  }

  get isClosed(): boolean {
    return this.#closed;
  }

  /** Return the running broker, starting one if necessary. */
  private async ensureBroker(): Promise<GeminiAcpBroker> {
    if (this.#closed) {
      throw new GeminiProcessError("Client is closed");
    }

    if (this.#broker && !this.#broker.isClosed) {
      return this.#broker;
    }

    // Serialize concurrent broker starts
    if (this.#brokerPending) {
      return this.#brokerPending;
    }

    this.logger?.debug?.("Starting broker...", { binaryPath: this.binaryPath, cwd: this.cwd });

    const pending = (async () => {
      try {
        this.#broker = await GeminiAcpBroker.start({
          binaryPath: this.binaryPath,
          cwd: this.cwd,
          ...(this.env ? { env: this.env } : {}),
          ...(this.onProtocolError ? { onProtocolError: this.onProtocolError } : {}),
          ...(this.logger ? { logger: this.logger } : {}),
        });

        this.emit({ type: "process_started", binaryPath: this.binaryPath, cwd: this.cwd });
        this.logger?.info?.("Broker started successfully");
        return this.#broker;
      } catch (error) {
        this.logger?.error?.(
          "Failed to start broker",
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      } finally {
        this.#brokerPending = undefined;
      }
    })();

    this.#brokerPending = pending;
    return pending;
  }

  /** Pre-open a background session to reduce latency for the next `openSession` call. */
  private async startWarmSession(): Promise<void> {
    // Avoid multiple warm starts
    if (this.#warmSessionPending) {
      await this.#warmSessionPending;
      return;
    }

    if (this.#warmSession || this.#closed) {
      return;
    }

    let warmSessionId: string | undefined;

    const warmPromise = (async () => {
      try {
        const broker = await this.ensureBroker();
        
        this.logger?.debug?.("Starting warm session...");

        const { sessionId } = await Promise.race([
          broker.openSession({
            cwd: this.cwd,
            mode: "yolo",
            createRoute: (createdId: string) => {
              warmSessionId = createdId;
              return {
                onSessionUpdate: () => {
                  // Ignore updates for warm sessions — they get rebound when taken
                },
                onPermissionRequest: async () => ({
                  outcome: { outcome: "cancelled" as const },
                }),
                onBrokerClose: () => {
                  if (this.#warmSession?.sessionId === warmSessionId) {
                    this.#warmSession = undefined;
                  }
                },
              };
            },
          }),
          new Promise<never>((_, reject) => {
            this.#warmTimeoutHandle = setTimeout(() => {
              this.#warmTimeoutHandle = undefined;
              reject(new Error("Warm session startup timeout"));
            }, this.warmStartTimeoutMs);
          }),
        ]);

        // Clear timeout on success
        if (this.#warmTimeoutHandle) {
          clearTimeout(this.#warmTimeoutHandle);
          this.#warmTimeoutHandle = undefined;
        }

        // Don't store warm session if client closed during startup
        if (this.#closed) {
          if (warmSessionId) {
            try {
              this.#broker?.releaseSession(warmSessionId);
            } catch { /* ignore */ }
          }
          return;
        }

        this.#warmSession = {
          sessionId,
          cwd: this.cwd,
          binaryPath: this.binaryPath,
        };

        this.emit({ type: "warm_session_ready", sessionId });
        this.logger?.info?.("Warm session ready", { sessionId });
      } catch (error) {
        // Clear timeout on failure
        if (this.#warmTimeoutHandle) {
          clearTimeout(this.#warmTimeoutHandle);
          this.#warmTimeoutHandle = undefined;
        }
        // Clean up leaked warm session on timeout
        if (warmSessionId) {
          try {
            this.#broker?.releaseSession(warmSessionId);
          } catch {
            // Ignore cleanup errors
          }
        }
        const errMsg = error instanceof Error ? error.message : String(error);
        this.emit({ type: "warm_session_failed", error: errMsg });
        this.logger?.warn?.("Failed to start warm session", errMsg);
      } finally {
        this.#warmSessionPending = undefined;
      }
    })();

    this.#warmSessionPending = warmPromise;
    await warmPromise;
  }
}

/**
 * Create a new Gemini ACP client, starting the Gemini CLI broker
 * process in the background.
 *
 * @param options - Client configuration. All fields are optional.
 * @returns A ready-to-use {@link GeminiClient}.
 * @throws {GeminiProcessError} If the broker process fails to start.
 *
 * @example
 * ```ts
 * const client = await createGeminiClient({ cwd: "/my/project" });
 * const session = await client.openSession();
 * ```
 */
export async function createGeminiClient(
  options?: GeminiClientOptions
): Promise<GeminiClient> {
  return await GeminiClientImpl.create(options);
}
