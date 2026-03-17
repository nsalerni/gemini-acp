import {
  type GeminiClient,
  type GeminiClientOptions,
  type GeminiSession,
  type GeminiSessionOptions,
  type GeminiLogger,
} from "./types";
import { GeminiAcpBroker } from "./GeminiAcpBroker";
import { GeminiSessionImpl } from "./GeminiSessionImpl";
import { GeminiProcessError } from "./errors";
import { trimToUndefined } from "./utils";

export class GeminiClientImpl implements GeminiClient {
  #broker: GeminiAcpBroker | undefined;
  #sessions = new Map<string, GeminiSessionImpl>();
  #closed = false;
  private binaryPath: string;
  private cwd: string;
  private env?: NodeJS.ProcessEnv;
  private logger?: GeminiLogger;
  private onProtocolError?: (error: Error) => void;

  private constructor(options: GeminiClientOptions) {
    this.binaryPath = options.binaryPath ?? "gemini";
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env;
    this.logger = options.logger;
    this.onProtocolError = options.onProtocolError;
  }

  static async create(options?: GeminiClientOptions): Promise<GeminiClientImpl> {
    const client = new GeminiClientImpl(options ?? {});
    await client.ensureBroker();
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
      const { sessionId, currentModel } = await broker.openSession({
        cwd,
        mode,
        resumeSessionId: options.resumeSessionId,
        model: options.model,
        createRoute: () => ({
          onSessionUpdate: () => {
            // Updates will be handled by the session
          },
          onPermissionRequest: async (request) => {
            if (options.onPermissionRequest) {
              return await options.onPermissionRequest(request);
            }
            return {
              outcome: {
                outcome: "cancelled",
              },
            };
          },
          onBrokerClose: () => {
            // Sessions will handle this
          },
        }),
      });

      const session = GeminiSessionImpl.create(sessionId, broker, currentModel, options, this.logger);
      this.#sessions.set(sessionId, session);

      this.logger?.info?.("Session opened", { sessionId, model: currentModel });

      return session;
    } catch (error) {
      this.logger?.error?.(
        "Failed to open session",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.logger?.info?.("Closing client...");
    this.#closed = true;

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

    this.logger?.debug?.("Starting broker...", { binaryPath: this.binaryPath, cwd: this.cwd });

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
    }
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
