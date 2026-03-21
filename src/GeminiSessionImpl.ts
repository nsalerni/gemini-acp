import {
  type GeminiSession,
  type GeminiSessionUpdate,
  type GeminiContentBlock,
  type GeminiPromptInput,
  type GeminiLogger,
} from "./types.js";
import { GeminiAcpBroker } from "./GeminiAcpBroker.js";
import { GeminiSessionClosedError } from "./errors.js";

function normalizePromptInput(input: GeminiPromptInput): readonly GeminiContentBlock[] {
  return typeof input === "string" ? [{ type: "text", text: input }] : input;
}

export class GeminiSessionImpl implements GeminiSession {
  readonly id: string;

  #currentModel: string | undefined;
  #broker: GeminiAcpBroker;
  #updates: GeminiSessionUpdate[] = [];
  #updateResolvers: Array<(update: GeminiSessionUpdate | null) => void> = [];
  #closed = false;
  #prompting = false;
  #turnComplete = true;
  #error?: Error;

  private constructor(
    sessionId: string,
    broker: GeminiAcpBroker,
    currentModel: string | undefined,
    private logger?: GeminiLogger
  ) {
    this.id = sessionId;
    this.#broker = broker;
    this.#currentModel = currentModel;
  }

  static create(
    sessionId: string,
    broker: GeminiAcpBroker,
    currentModel: string | undefined,
    logger?: GeminiLogger
  ): GeminiSessionImpl {
    return new GeminiSessionImpl(sessionId, broker, currentModel, logger);
  }

  get currentModel(): string | undefined {
    return this.#currentModel;
  }

  async prompt(input: GeminiPromptInput): Promise<void> {
    await this.#startPrompt(normalizePromptInput(input));
  }

  send(input: GeminiPromptInput): AsyncIterable<GeminiSessionUpdate> {
    const completion = this.#startPrompt(normalizePromptInput(input)).then(
      () => ({ ok: true as const }),
      (error) => ({
        ok: false as const,
        error: error instanceof Error ? error : new Error(String(error)),
      }),
    );
    return this.#sendUpdates(completion);
  }

  async *#sendUpdates(
    completion: Promise<{ ok: true } | { ok: false; error: Error }>,
  ): AsyncIterable<GeminiSessionUpdate> {
    for await (const update of this.updates()) {
      yield update;
    }
    const result = await completion;
    if (!result.ok) {
      throw result.error;
    }
  }

  #startPrompt(blocks: readonly GeminiContentBlock[]): Promise<void> {
    if (this.#closed) {
      throw new GeminiSessionClosedError("Session is closed");
    }
    if (this.#prompting) {
      throw new GeminiSessionClosedError("A prompt is already in progress on this session");
    }

    this.logger?.debug?.("Sending prompt...", { sessionId: this.id, blockCount: blocks.length });

    this.#updates = [];
    this.#turnComplete = false;
    this.#prompting = true;

    return (async () => {
      try {
        await this.#broker.prompt(this.id, blocks);
        this.logger?.debug?.("Prompt completed", { sessionId: this.id });
      } catch (error) {
        this.logger?.error?.(
          "Prompt failed",
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      } finally {
        this.#prompting = false;
        this.#turnComplete = true;
        this.notifyAllResolvers();
      }
    })();
  }

  async setMode(mode: "yolo" | "plan"): Promise<void> {
    if (this.#closed) {
      throw new GeminiSessionClosedError("Session is closed");
    }
    this.logger?.debug?.("Setting mode...", { sessionId: this.id, mode });
    await this.#broker.setMode(this.id, mode);
  }

  async setModel(modelId: string): Promise<void> {
    if (this.#closed) {
      throw new GeminiSessionClosedError("Session is closed");
    }
    this.logger?.debug?.("Setting model...", { sessionId: this.id, modelId });
    await this.#broker.setModel(this.id, modelId);
    this.#currentModel = modelId;
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

  private notifyAllResolvers() {
    for (const resolver of this.#updateResolvers) {
      resolver(null);
    }
    this.#updateResolvers = [];
  }

  // Public methods for route handlers
  handleUpdate(update: GeminiSessionUpdate): void {
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

  handleBrokerClose(closeInput: { error?: Error; stderr: string }): void {
    this.#error = closeInput.error ?? new Error(closeInput.stderr.trim() || "Broker closed");
    this.#closed = true;
    this.notifyAllResolvers();
  }
}
