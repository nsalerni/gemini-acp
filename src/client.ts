import {
  type GeminiClient,
  type GeminiClientOptions,
  type GeminiSession,
  type GeminiSessionOptions,
  type GeminiLogger,
} from "./types.js";
import { GeminiAcpBroker } from "./GeminiAcpBroker.js";
import { GeminiSessionImpl } from "./GeminiSessionImpl.js";
import { GeminiProcessError } from "./errors.js";
import { trimToUndefined } from "./utils.js";

interface GeminiWarmSession {
  readonly broker: GeminiAcpBroker;
  readonly sessionId: string;
  readonly cwd: string;
  readonly binaryPath: string;
}

export class GeminiClientImpl implements GeminiClient {
  #broker: GeminiAcpBroker | undefined;
  #brokerPending: Promise<GeminiAcpBroker> | undefined;
  #sessions = new Map<string, GeminiSessionImpl>();
  #warmSession: GeminiWarmSession | undefined;
  #warmSessionPending: Promise<void> | undefined;
  #closed = false;
  private binaryPath: string;
  private cwd: string;
  private env?: NodeJS.ProcessEnv;
  private logger?: GeminiLogger;
  private onProtocolError?: (error: Error) => void;
  private warmStart: boolean;
  private warmStartTimeoutMs: number;

  private constructor(options: GeminiClientOptions) {
    this.binaryPath = options.binaryPath ?? "gemini";
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env;
    this.logger = options.logger;
    this.onProtocolError = options.onProtocolError;
    this.warmStart = options.warmStart ?? false;
    this.warmStartTimeoutMs = options.warmStartTimeoutMs ?? 30_000;
  }

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

  async openSession(options: GeminiSessionOptions): Promise<GeminiSession> {
    if (this.#closed) {
      throw new GeminiProcessError("Client is closed");
    }

    const broker = await this.ensureBroker();

    const cwd = trimToUndefined(options.cwd) ?? this.cwd;
    const mode = options.mode ?? "yolo";

    this.logger?.debug?.("Opening session...", { cwd, mode, model: options.model });

    try {
      // Check if we can use the warm session
      if (
        this.#warmSession &&
        this.#warmSession.cwd === cwd &&
        this.#warmSession.binaryPath === this.binaryPath &&
        !options.resumeSessionId
      ) {
        return await this.takeWarmSession(this.#warmSession, broker, options, mode);
      }

      // Regular session opening
      return await this.openNewSession(broker, options, cwd, mode);
    } catch (error) {
      this.logger?.error?.(
        "Failed to open session",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  private async openNewSession(
    broker: GeminiAcpBroker,
    options: GeminiSessionOptions,
    cwd: string,
    mode: "yolo" | "plan",
  ): Promise<GeminiSession> {
    let createdSession: GeminiSessionImpl | undefined;
    const result = await broker.openSession({
      cwd,
      mode,
      resumeSessionId: options.resumeSessionId,
      model: options.model,
      createRoute: (createdSessionId: string) => {
        createdSession = GeminiSessionImpl.create(createdSessionId, broker, undefined, this.logger);
        this.#sessions.set(createdSessionId, createdSession);
        return {
          onSessionUpdate: (update) => createdSession!.handleUpdate(update),
          onPermissionRequest: async (request) => {
            if (options.onPermissionRequest) {
              return await options.onPermissionRequest(request);
            }
            return { outcome: { outcome: "cancelled" } };
          },
          onBrokerClose: (closeInput) => {
            createdSession!.handleBrokerClose(closeInput);
          },
        };
      },
    });

    const session = this.#sessions.get(result.sessionId)!;
    this.logger?.info?.("Session opened", { sessionId: result.sessionId, model: result.currentModel });
    return session;
  }

  private async takeWarmSession(
    warm: GeminiWarmSession,
    broker: GeminiAcpBroker,
    options: GeminiSessionOptions,
    mode: "yolo" | "plan",
  ): Promise<GeminiSession> {
    const sessionId = warm.sessionId;
    this.logger?.debug?.("Taking warm session", { sessionId });
    this.#warmSession = undefined;

    // Create a real session and rebind the broker route to it
    const session = GeminiSessionImpl.create(sessionId, broker, undefined, this.logger);
    this.#sessions.set(sessionId, session);

    broker.bindSession(sessionId, {
      onSessionUpdate: (update) => session.handleUpdate(update),
      onPermissionRequest: async (request) => {
        if (options.onPermissionRequest) {
          return await options.onPermissionRequest(request);
        }
        return { outcome: { outcome: "cancelled" } };
      },
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
      } catch (error) {
        this.logger?.warn?.("Failed to set model on warm session", error instanceof Error ? error.message : String(error));
      }
    }

    // Start another warm session in the background
    void this.startWarmSession().catch((error) => {
      this.logger?.warn?.("Failed to restart warm session", error instanceof Error ? error.message : String(error));
    });

    this.logger?.info?.("Session opened", { sessionId, model: options.model, fromWarm: true });
    return session;
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.logger?.info?.("Closing client...");
    this.#closed = true;

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

  private async ensureBroker(): Promise<GeminiAcpBroker> {
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

  private async startWarmSession(): Promise<void> {
    // Avoid multiple warm starts
    if (this.#warmSessionPending) {
      await this.#warmSessionPending;
      return;
    }

    if (this.#warmSession) {
      return;
    }

    let warmSessionId: string | undefined;

    const warmPromise = (async () => {
      try {
        const broker = await this.ensureBroker();
        
        this.logger?.debug?.("Starting warm session...");

        const timeoutHandle = setTimeout(() => {
          // noop — just for the race
        }, this.warmStartTimeoutMs);

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
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Warm session startup timeout")),
              this.warmStartTimeoutMs
            )
          ),
        ]);

        clearTimeout(timeoutHandle);

        this.#warmSession = {
          broker,
          sessionId,
          cwd: this.cwd,
          binaryPath: this.binaryPath,
        };

        this.logger?.info?.("Warm session ready", { sessionId });
      } catch (error) {
        // Clean up leaked warm session on timeout
        if (warmSessionId) {
          try {
            this.#broker?.releaseSession(warmSessionId);
          } catch {
            // Ignore cleanup errors
          }
        }
        this.logger?.warn?.(
          "Failed to start warm session",
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        this.#warmSessionPending = undefined;
      }
    })();

    this.#warmSessionPending = warmPromise;
    await warmPromise;
  }
}

/**
 * Create a new Gemini ACP client
 */
export async function createGeminiClient(
  options?: GeminiClientOptions
): Promise<GeminiClient> {
  return await GeminiClientImpl.create(options);
}
