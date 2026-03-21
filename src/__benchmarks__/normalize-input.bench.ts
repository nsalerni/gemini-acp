/**
 * Benchmarks for prompt input normalization — the conversion from
 * string | ContentBlock[] to the canonical ContentBlock[] format.
 */

import { bench, describe } from "vitest";
import type { GeminiContentBlock, GeminiPromptInput } from "../types.js";

// ── Mirrors the normalizePromptInput function ───────────────────────────────

function normalizePromptInput(input: GeminiPromptInput): readonly GeminiContentBlock[] {
  return typeof input === "string" ? [{ type: "text", text: input }] : input;
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const SHORT_STRING = "Hello world";
const LONG_STRING = "x".repeat(10_000);
const SINGLE_BLOCK: readonly GeminiContentBlock[] = [{ type: "text", text: "Hello world" }];
const MULTI_BLOCK: readonly GeminiContentBlock[] = [
  { type: "text", text: "Describe this image" },
  { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=".repeat(100) },
];

// ── Benchmarks ──────────────────────────────────────────────────────────────

describe("normalizePromptInput", () => {
  bench("short string → block", () => {
    normalizePromptInput(SHORT_STRING);
  });

  bench("long string (10KB) → block", () => {
    normalizePromptInput(LONG_STRING);
  });

  bench("single block passthrough", () => {
    normalizePromptInput(SINGLE_BLOCK);
  });

  bench("multi-block passthrough (text + image)", () => {
    normalizePromptInput(MULTI_BLOCK);
  });
});
