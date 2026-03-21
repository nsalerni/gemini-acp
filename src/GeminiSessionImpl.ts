import {
  type GeminiSession,
  type GeminiSessionUpdate,
  type GeminiContentBlock,
  type GeminiPromptInput,
  type GeminiAcpPromptResponse,
  type GeminiClientEvent,
  type GeminiLogger,
} from "./types.js";
import { GeminiAcpBroker } from "./GeminiAcpBroker.js";
import { GeminiSessionClosedError, GeminiSessionBusyError } from "./errors.js";

function normalizePromptInput(input: GeminiPromptInput): readonly GeminiContentBlock[] {
  return typeof input === "string" ? [{ type: "text", text: input }] : input;
}

export class GeminiSessionImpl implements GeminiSession {
  readonly id: string;

  #currentModel: string | undefined;
  #broker: GeminiAcpBroker;
  #updates: GeminiSessionUpdate[] = [];
  #updatesHead = 0;
  #updateResolvers: Array<(update: GeminiSessionUpdate | null) => void> = [];
  #resolversHead = 0;
  #closed = false;
  #prompting = false;
  #consuming = false;
  #turnComplete = true;
  #promptTimeoutMs: number | undefined;
  #error?: Error;
  #onEvent?: (event: GeminiClientEvent) => void;
  #onDispose?: (sessionId: string) => void;

  private constructor(
    sessionId: string,
    broker: GeminiAcpBroker,
    currentModel: string | undefined,
    private logger?: GeminiLogger,
  ) {
    this.id = sessionId;
    this.#broker = broker;
    this.#currentModel = currentModel;
  }

  static create(
    sessionId: string,
    broker: GeminiAcpBroker,
    currentModel: string | undefined,
    logger?: GeminiLogger,
    options?: {
      promptTimeoutMs?: number;
      onEvent?: (event: GeminiClientEvent) => void;
      onDispose?: (sessionId: string) => void;
    },
  ): GeminiSessionImpl {
    const session = new GeminiSessionImpl(sessionId, broker, currentModel, logger);
    session.#promptTimeoutMs = options?.promptTimeoutMs;
    session.#onEvent = options?.onEvent;
    session.#onDispose = options?.onDispose;
    return session;
  }

  get currentModel(): string | undefined {
    return this.#currentModel;
  }

  /** @internal */
  setCurrentModel(model: string | undefined): void {
    this.#currentModel = model;
  }

  async prompt(input: GeminiPromptInput): Promise<GeminiAcpPromptResponse> {
    return await this.#startPrompt(normalizePromptInput(input));
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

  #startPrompt(blocks: readonly GeminiContentBlock[]): Promise<GeminiAcpPromptResponse> {
    if (this.#closed) {
      throw new GeminiSessionClosedError("Session is closed");
    }
    if (this.#prompting) {
      throw new GeminiSessionBusyError("A prompt is already in progress on this session");
    }

    this.logger?.debug?.("Sending prompt...", { sessionId: this.id, blockCount: blocks.length });

    this.#compactUpdates();
    this.#updates.length = 0;
    this.#updatesHead = 0;
    this.#turnComplete = false;
    this.#prompting = true;

    this.#emitEvent({ type: "prompt_started", sessionId: this.id });

    return (async () => {
      try {
        const response = await this.#broker.prompt(this.id, blocks, this.#promptTimeoutMs);
        this.#emitEvent({ type: "prompt_completed", sessionId: this.id, stopReason: response.stopReason });
        this.logger?.debug?.("Prompt completed", { sessionId: this.id });
        return response;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.#emitEvent({ type: "prompt_failed", sessionId: this.id, error: errMsg });
        this.logger?.error?.("Prompt failed", errMsg);
        throw error;
      } finally {
        this.#prompting = false;
        this.#turnComplete = true;
        this.#notifyAllResolvers();
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
    if (this.#consuming) {
      throw new GeminiSessionBusyError(
        "Another consumer is already iterating updates on this session. " +
        "Only one updates() or send() consumer is allowed per turn.",
      );
    }
    this.#consuming = true;

    try {
      // Yield any buffered updates first (indexed queue)
      while (this.#updatesHead < this.#updates.length) {
        yield this.#updates[this.#updatesHead++];
      }
      this.#compactUpdates();

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
      while (this.#updatesHead < this.#updates.length) {
        yield this.#updates[this.#updatesHead++];
      }
      this.#compactUpdates();

      if (this.#error) {
        throw this.#error;
      }
    } finally {
      this.#consuming = false;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.logger?.debug?.("Closing session...", { sessionId: this.id });
    this.#closed = true;
    this.#broker.releaseSession(this.id);
    this.#notifyAllResolvers();
    this.#onDispose?.(this.id);
  }

  #notifyAllResolvers() {
    for (let i = this.#resolversHead; i < this.#updateResolvers.length; i++) {
      this.#updateResolvers[i](null);
    }
    this.#updateResolvers.length = 0;
    this.#resolversHead = 0;
  }

  #emitEvent(event: GeminiClientEvent): void {
    try {
      this.#onEvent?.(event);
    } catch {
      // Never let event handler errors propagate
    }
  }

  #compactUpdates() {
    if (this.#updatesHead > 0) {
      this.#updates.splice(0, this.#updatesHead);
      this.#updatesHead = 0;
    }
  }

  // Public methods for route handlers
  handleUpdate(update: GeminiSessionUpdate): void {
    if (this.#closed) {
      return;
    }

    if (this.#resolversHead < this.#updateResolvers.length) {
      const resolver = this.#updateResolvers[this.#resolversHead++];
      // Compact resolvers when they grow
      if (this.#resolversHead > 64) {
        this.#updateResolvers.splice(0, this.#resolversHead);
        this.#resolversHead = 0;
      }
      resolver(update);
    } else {
      this.#updates.push(update);
    }
  }

  handleBrokerClose(closeInput: { error?: Error; stderr: string }): void {
    this.#error = closeInput.error ?? new Error(closeInput.stderr.trim() || "Broker closed");
    this.#closed = true;
    this.#notifyAllResolvers();
    this.#onDispose?.(this.id);
  }
}
