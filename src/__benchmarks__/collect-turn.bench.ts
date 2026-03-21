/**
 * Benchmarks for collectTurn() — measures the cost of aggregating
 * streaming updates into a structured result.
 */

import { bench, describe } from "vitest";
import { collectTurn } from "../helpers/collectTurn.js";
import type { GeminiSessionUpdate } from "../types.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeMessageChunks(count: number, chunkSize: number): GeminiSessionUpdate[] {
  const text = "x".repeat(chunkSize);
  return Array.from({ length: count }, (): GeminiSessionUpdate => ({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text },
  }));
}

function makeToolCalls(count: number): GeminiSessionUpdate[] {
  const updates: GeminiSessionUpdate[] = [];
  for (let i = 0; i < count; i++) {
    updates.push({
      sessionUpdate: "tool_call",
      toolCallId: `tc-${i}`,
      title: `tool_${i}`,
      kind: "read",
      status: "in_progress",
      content: null,
      rawInput: undefined,
      rawOutput: undefined,
      locations: null,
    });
    updates.push({
      sessionUpdate: "tool_call_update",
      toolCallId: `tc-${i}`,
      status: "completed",
      title: `tool_${i}`,
      kind: "read",
      content: null,
      rawInput: undefined,
      rawOutput: undefined,
      locations: null,
    });
  }
  return updates;
}

function makeMixedTurn(): GeminiSessionUpdate[] {
  return [
    ...makeMessageChunks(10, 100),
    ...makeToolCalls(5),
    {
      sessionUpdate: "plan",
      entries: [
        { content: "Step 1: Read files", status: "completed" },
        { content: "Step 2: Analyze", status: "in_progress" },
        { content: "Step 3: Write output", status: "pending" },
      ],
    } as GeminiSessionUpdate,
    ...makeMessageChunks(20, 200),
    ...makeToolCalls(3),
    ...makeMessageChunks(5, 50),
  ];
}

async function* toAsyncIterable(updates: GeminiSessionUpdate[]): AsyncIterable<GeminiSessionUpdate> {
  for (const u of updates) {
    yield u;
  }
}

// ── Benchmarks ──────────────────────────────────────────────────────────────

describe("collectTurn", () => {
  const smallTurn = makeMessageChunks(10, 50);
  const mediumTurn = makeMessageChunks(100, 200);
  const largeTurn = makeMessageChunks(1000, 100);
  const mixedTurn = makeMixedTurn();

  bench("small turn (10 chunks, 50B each)", async () => {
    await collectTurn(toAsyncIterable(smallTurn));
  });

  bench("medium turn (100 chunks, 200B each)", async () => {
    await collectTurn(toAsyncIterable(mediumTurn));
  });

  bench("large turn (1000 chunks, 100B each)", async () => {
    await collectTurn(toAsyncIterable(largeTurn));
  });

  bench("mixed turn (messages + tools + plan)", async () => {
    await collectTurn(toAsyncIterable(mixedTurn));
  });
});
