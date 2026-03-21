/**
 * Benchmarks for the session update queue — compares the indexed queue
 * approach (used in GeminiSessionImpl) vs naive Array.shift().
 *
 * This is the hot path for every streaming update from the agent.
 */

import { bench, describe } from "vitest";
import type { GeminiSessionUpdate } from "../types.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeUpdate(i: number): GeminiSessionUpdate {
  return {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: `chunk-${i}` },
  };
}

// ── Naive shift-based queue (old approach) ──────────────────────────────────

class ShiftQueue {
  #items: GeminiSessionUpdate[] = [];

  push(item: GeminiSessionUpdate) {
    this.#items.push(item);
  }

  shift(): GeminiSessionUpdate | undefined {
    return this.#items.shift();
  }

  get length() {
    return this.#items.length;
  }
}

// ── Indexed queue (current approach) ────────────────────────────────────────

class IndexedQueue {
  #items: GeminiSessionUpdate[] = [];
  #head = 0;

  push(item: GeminiSessionUpdate) {
    this.#items.push(item);
  }

  shift(): GeminiSessionUpdate | undefined {
    if (this.#head >= this.#items.length) return undefined;
    const item = this.#items[this.#head++];
    if (this.#head > 64) {
      this.#items.splice(0, this.#head);
      this.#head = 0;
    }
    return item;
  }

  get length() {
    return this.#items.length - this.#head;
  }
}

// ── Benchmarks ──────────────────────────────────────────────────────────────

describe("update queue: 100 items (small turn)", () => {
  const N = 100;

  bench("Array.shift() queue", () => {
    const q = new ShiftQueue();
    for (let i = 0; i < N; i++) q.push(makeUpdate(i));
    while (q.length > 0) q.shift();
  });

  bench("indexed queue (current)", () => {
    const q = new IndexedQueue();
    for (let i = 0; i < N; i++) q.push(makeUpdate(i));
    while (q.length > 0) q.shift();
  });
});

describe("update queue: 1000 items (large turn)", () => {
  const N = 1000;

  bench("Array.shift() queue", () => {
    const q = new ShiftQueue();
    for (let i = 0; i < N; i++) q.push(makeUpdate(i));
    while (q.length > 0) q.shift();
  });

  bench("indexed queue (current)", () => {
    const q = new IndexedQueue();
    for (let i = 0; i < N; i++) q.push(makeUpdate(i));
    while (q.length > 0) q.shift();
  });
});

describe("update queue: 10000 items (stress)", () => {
  const N = 10_000;

  bench("Array.shift() queue", () => {
    const q = new ShiftQueue();
    for (let i = 0; i < N; i++) q.push(makeUpdate(i));
    while (q.length > 0) q.shift();
  });

  bench("indexed queue (current)", () => {
    const q = new IndexedQueue();
    for (let i = 0; i < N; i++) q.push(makeUpdate(i));
    while (q.length > 0) q.shift();
  });
});

describe("update queue: interleaved push/shift (realistic)", () => {
  const N = 500;

  bench("Array.shift() queue", () => {
    const q = new ShiftQueue();
    for (let i = 0; i < N; i++) {
      q.push(makeUpdate(i));
      if (i % 3 === 0) q.shift();
    }
    while (q.length > 0) q.shift();
  });

  bench("indexed queue (current)", () => {
    const q = new IndexedQueue();
    for (let i = 0; i < N; i++) {
      q.push(makeUpdate(i));
      if (i % 3 === 0) q.shift();
    }
    while (q.length > 0) q.shift();
  });
});
