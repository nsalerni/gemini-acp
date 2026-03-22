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

/**
 * Normalize prompt input into an array of content blocks.
 *
 * Converts a plain string into a single `text` content block, or returns
 * the input array unchanged.
 *
 * @internal
 */
function normalizePromptInput(input: GeminiPromptInput): readonly GeminiContentBlock[] {
  return typeof input === "string" ? [{ type: "text", text: input }] : input;
}

/**
 * Concrete implementation of {@link GeminiSession}.
 *
 * Manages a single multiplexed session on top of a {@link GeminiAcpBroker},
 * providing prompt submission, streaming update iteration, mode/model
 * switching, and session lifecycle control.
 *
 * Instances are created via the static {@link GeminiSessionImpl.create} factory
 * and should not be constructed directly.
 *
 * @internal
 */
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

  /**
   * Create a new {@link GeminiSessionImpl} instance.
   *
   * @param sessionId - Unique session identifier assigned by the Gemini CLI.
   * @param broker - The broker that owns the underlying CLI process.
   * @param currentModel - The initially selected model ID, if known.
   * @param logger - Optional logger for debug/error output.
   * @param options - Optional configuration for timeouts, event callbacks, and disposal hooks.
   * @returns A fully initialised session instance.
   */
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

  /** The currently selected model ID, or `undefined` if not yet determined. */
  get currentModel(): string | undefined {
    return this.#currentModel;
  }

  /**
   * Set the current model ID without sending a request to the broker.
   *
   * Used by the client to reflect model changes originating from the CLI side.
   *
   * @internal
   */
  setCurrentModel(model: string | undefined): void {
    this.#currentModel = model;
  }

  /**
   * Send a prompt and wait for the turn to complete.
   *
   * @param input - The prompt text or content blocks to send.
   * @returns The prompt response including the stop reason.
   * @throws {GeminiSessionClosedError} If the session has been closed.
   * @throws {GeminiSessionBusyError} If another prompt is already in progress.
   * @throws {GeminiTimeoutError} If the prompt exceeds the configured timeout.
   */
  async prompt(input: GeminiPromptInput): Promise<GeminiAcpPromptResponse> {
    return await this.#startPrompt(normalizePromptInput(input));
  }

  /**
   * Send a prompt and return an async iterable of session updates.
   *
   * This is the recommended high-level API — it submits the prompt and
   * yields all updates for the turn in a single call.
   *
   * @param input - The prompt text or content blocks to send.
   * @returns An async iterable yielding session updates until the turn completes.
   * @throws {GeminiSessionClosedError} If the session has been closed.
   * @throws {GeminiSessionBusyError} If another prompt is already in progress.
   */
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

  /** Yield updates from {@link updates} and then propagate any prompt error. */
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

  /** Submit a prompt to the broker, managing turn lifecycle flags and events. */
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

  /**
   * Change the session mode.
   *
   * @param mode - The new mode: `"yolo"` for auto-execute or `"plan"` for approval-required.
   * @throws {GeminiSessionClosedError} If the session has been closed.
   */
  async setMode(mode: "yolo" | "plan"): Promise<void> {
    if (this.#closed) {
      throw new GeminiSessionClosedError("Session is closed");
    }
    this.logger?.debug?.("Setting mode...", { sessionId: this.id, mode });
    await this.#broker.setMode(this.id, mode);
  }

  /**
   * Switch to a different model.
   *
   * @param modelId - The model identifier to switch to.
   * @throws {GeminiSessionClosedError} If the session has been closed.
   */
  async setModel(modelId: string): Promise<void> {
    if (this.#closed) {
      throw new GeminiSessionClosedError("Session is closed");
    }
    this.logger?.debug?.("Setting model...", { sessionId: this.id, modelId });
    await this.#broker.setModel(this.id, modelId);
    this.#currentModel = modelId;
  }

  /**
   * Cancel the currently running prompt.
   *
   * This is a no-op if no prompt is in progress or the session is closed.
   */
  cancel(): Promise<void> {
    if (this.#closed) {
      return Promise.resolve();
    }

    this.logger?.debug?.("Cancelling session...", { sessionId: this.id });
    this.#broker.cancel(this.id);
    return Promise.resolve();
  }

  /**
   * Get an async iterable of updates for the current turn.
   *
   * Yields any buffered updates first, then awaits future updates until
   * the turn completes or the session closes. Only one consumer may
   * iterate updates at a time per turn.
   *
   * @returns An async iterable yielding session updates until the turn completes.
   * @throws {GeminiSessionBusyError} If another consumer is already iterating updates.
   */
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
        let resolver: ((update: GeminiSessionUpdate | null) => void) | undefined;
        try {
          const update = await new Promise<GeminiSessionUpdate | null>((resolve) => {
            resolver = resolve;
            this.#updateResolvers.push(resolve);
          });
          resolver = undefined; // Resolved, no cleanup needed
          if (update === null) break;
          yield update;
        } finally {
          // If the consumer abandoned iteration while we were waiting,
          // remove the unresolved resolver to prevent stale references.
          if (resolver) {
            const idx = this.#updateResolvers.indexOf(resolver);
            if (idx !== -1) {
              this.#updateResolvers.splice(idx, 1);
            }
          }
        }
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

  /**
   * Close the session.
   *
   * Releases the session route from the broker and resolves all pending
   * update waiters. The remote session remains resumable via
   * `GeminiClient.openSession` with `resumeSessionId`.
   */
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

  /** Resolve all pending update waiters with `null` and reset the resolver queue. */
  #notifyAllResolvers() {
    for (let i = this.#resolversHead; i < this.#updateResolvers.length; i++) {
      this.#updateResolvers[i](null);
    }
    this.#updateResolvers.length = 0;
    this.#resolversHead = 0;
  }

  /** Safely invoke the user-provided event callback, swallowing errors. */
  #emitEvent(event: GeminiClientEvent): void {
    try {
      this.#onEvent?.(event);
    } catch {
      // Never let event handler errors propagate
    }
  }

  /** Compact the updates queue by removing already-consumed entries. */
  #compactUpdates() {
    if (this.#updatesHead > 0) {
      this.#updates.splice(0, this.#updatesHead);
      this.#updatesHead = 0;
    }
  }

  /**
   * Deliver an update from the broker to the session.
   *
   * If a consumer is waiting via {@link updates}, the update is handed
   * directly to its resolver; otherwise it is buffered.
   *
   * @internal
   */
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

  /**
   * Handle unexpected broker closure.
   *
   * Records the error, marks the session as closed, and resolves all
   * pending update waiters so consumers unblock.
   *
   * @internal
   */
  handleBrokerClose(closeInput: { error?: Error; stderr: string }): void {
    this.#error = closeInput.error ?? new Error(closeInput.stderr.trim() || "Broker closed");
    this.#closed = true;
    this.#notifyAllResolvers();
    this.#onDispose?.(this.id);
  }
}
