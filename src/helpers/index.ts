/**
 * Helper utilities for Gemini ACP.
 *
 * This module re-exports convenience functions and types that simplify common
 * tasks when working with Gemini ACP sessions, including collecting turn
 * results, converting image files to content blocks, and creating isolated
 * Gemini home directories for sandboxed execution.
 *
 * @module helpers
 */

export { collectTurn } from "./collectTurn.js";
export type { GeminiToolCallSummary, GeminiTurnResult } from "./collectTurn.js";
export { imageFileToContentBlock } from "./imageFileToContentBlock.js";
export { createIsolatedGeminiHome } from "./createIsolatedGeminiHome.js";
