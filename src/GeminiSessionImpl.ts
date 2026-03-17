import {
  type GeminiSession,
  type GeminiSessionOptions,
  type GeminiSessionUpdate,
  type GeminiContentBlock,
  type GeminiLogger,
} from "./types";
import { GeminiAcpBroker } from "./GeminiAcpBroker";
import { GeminiSessionNotFoundError } from "./errors";

export class GeminiSessionImpl implements GeminiSession {
  readonly id: string;
  readonly currentModel?: string;

  #broker: GeminiAcpBroker;
  #updates: GeminiSessionUpdate[] = [];
  #updateResolvers: Array<(update: GeminiSessionUpdate | null) => void> = [];
  #closed = false;
  #turnComplete = false;
  #error?: Error;

  private constructor(
    sessionId: string,
    broker: GeminiAcpBroker,
    currentModel: string | undefined,
    private logger?: GeminiLogger
  ) {
    this.id = sessionId;
    this.#broker = broker;
    this.currentModel = currentModel;
  }

  static create(
    sessionId: string,
    broker: GeminiAcpBroker,
    currentModel: string | undefined,
    _options: GeminiSessionOptions,
    logger?: GeminiLogger
  ): GeminiSessionImpl {
    const session = new GeminiSessionImpl(sessionId, broker, currentModel, logger);
    return session;
  }

  async prompt(blocks: readonly GeminiContentBlock[]): Promise<void> {
    if (this.#closed) {
      throw new GeminiSessionNotFoundError("Session is closed");
    }

    this.logger?.debug?.("Sending prompt...", { sessionId: this.id, blockCount: blocks.length });

    // Clear previous updates and reset turn state
    this.#updates = [];
    this.#turnComplete = false;

    try {
      await this.#broker.prompt(this.id, blocks);
      this.logger?.debug?.("Prompt completed", { sessionId: this.id });
    } catch (error) {
      this.logger?.error?.(
        "Prompt failed",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    } finally {
      this.#turnComplete = true;
      this.notifyAllResolvers();
    }
  }

  async setMode(mode: "yolo" | "plan"): Promise<void> {
    if (this.#closed) {
      throw new GeminiSessionNotFoundError("Session is closed");
    }
    this.logger?.debug?.("Setting mode...", { sessionId: this.id, mode });
    await this.#broker.setMode(this.id, mode);
  }

  async setModel(modelId: string): Promise<void> {
    if (this.#closed) {
      throw new GeminiSessionNotFoundError("Session is closed");
    }
    this.logger?.debug?.("Setting model...", { sessionId: this.id, modelId });
    await this.#broker.setModel(this.id, modelId);
    (this as any).currentModel = modelId;
  }

  cancel(): Promise<void> {
    if (this.#closed) {
      return Promise.resolve();
    }

    this.logger?.debug?.("Cancelling session...", { sessionId: this.id });
    this.#broker.cancel(this.id);
    return Promise.resolve();
  }

  async *updates(): AsyncIterable<GeminiSessionUpdate> {
    // Yield any buffered updates first
    while (this.#updates.length > 0) {
      yield this.#updates.shift()!;
    }

    // Then yield future updates until turn completes or session closes
    while (!this.#closed && !this.#turnComplete) {
      const update = await new Promise<GeminiSessionUpdate | null>((resolve) => {
        this.#updateResolvers.push(resolve);
      });

      if (update === null) {
        break;
      }

      yield update;
    }

    // Drain any remaining buffered updates
    while (this.#updates.length > 0) {
      yield this.#updates.shift()!;
    }

    if (this.#error) {
      throw this.#error;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.logger?.debug?.("Closing session...", { sessionId: this.id });
    this.#closed = true;
    this.#broker.releaseSession(this.id);
    this.notifyAllResolvers();
  }

  private _handleUpdate(update: GeminiSessionUpdate) {
    if (this.#closed) {
      return;
    }

    if (this.#updateResolvers.length > 0) {
      const resolver = this.#updateResolvers.shift()!;
      resolver(update);
    } else {
      this.#updates.push(update);
    }
  }

  private notifyAllResolvers() {
    for (const resolver of this.#updateResolvers) {
      // Signal end by having updates() exit
      resolver(null as any);
    }
    this.#updateResolvers = [];
  }

  // Public methods for route handlers
  handleUpdate(update: GeminiSessionUpdate): void {
    return this._handleUpdate(update);
  }

  handleBrokerClose(closeInput: { error?: Error; stderr: string }): void {
    this.#error = closeInput.error ?? new Error(closeInput.stderr.trim() || "Broker closed");
    this.notifyAllResolvers();
  }
}
