import {
  type GeminiSessionUpdate,
  type GeminiAcpToolKind,
  type GeminiAcpToolStatus,
} from "../types.js";

/**
 * Summary of a single tool call made during an agent turn.
 *
 * Each summary captures the identifying information and the latest state of a
 * tool invocation. When a `tool_call_update` is received, the corresponding
 * summary is merged so that this always reflects the most recent values.
 */
export interface GeminiToolCallSummary {
  /** Unique identifier for this tool call within the turn. */
  readonly toolCallId: string;
  /** Human-readable title describing the tool action. */
  readonly title: string;
  /** The category/kind of tool that was invoked (e.g. `"shell"`, `"file_edit"`), if available. */
  readonly kind?: GeminiAcpToolKind | null;
  /** The execution status of the tool call (e.g. `"running"`, `"completed"`), if available. */
  readonly status?: GeminiAcpToolStatus | null;
}

/**
 * The collected result of a complete agent turn.
 */
export interface GeminiTurnResult {
  /** The full agent text response, concatenated from all message chunks. */
  readonly text: string;
  /** All tool calls made during the turn. */
  readonly toolCalls: GeminiToolCallSummary[];
  /** Plan entries, if the session was in plan mode. */
  readonly plan: string[];
  /** All raw updates received during the turn. */
  readonly updates: GeminiSessionUpdate[];
}

/**
 * Collect all streaming updates from an agent turn into a single structured result.
 *
 * This is a convenience wrapper around the `AsyncIterable<GeminiSessionUpdate>`
 * returned by {@link GeminiSession.send}. It consumes the entire iterable,
 * concatenates message text chunks, tracks tool call state, and captures any
 * plan entries so you don't have to manually iterate and aggregate updates.
 *
 * @param updates - The async iterable of session updates produced by
 *   {@link GeminiSession.send} or any other source of {@link GeminiSessionUpdate}.
 * @returns A promise that resolves to a {@link GeminiTurnResult} containing the
 *   concatenated agent text, tool call summaries, plan entries, and the raw
 *   list of all updates received during the turn.
 *
 * @example
 * ```ts
 * const session = await client.createSession({ workingDir: "/my/project" });
 * const result = await collectTurn(session.send("Explain this code"));
 * console.log(result.text);
 * console.log(`${result.toolCalls.length} tools used`);
 * for (const tool of result.toolCalls) {
 *   console.log(`  [${tool.status}] ${tool.title}`);
 * }
 * ```
 */
export async function collectTurn(
  updates: AsyncIterable<GeminiSessionUpdate>,
): Promise<GeminiTurnResult> {
  const allUpdates: GeminiSessionUpdate[] = [];
  const textParts: string[] = [];
  const toolCalls = new Map<string, GeminiToolCallSummary>();
  const plan: string[] = [];

  for await (const update of updates) {
    allUpdates.push(update);

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content?.text) {
          textParts.push(update.content.text);
        }
        break;

      case "tool_call":
        toolCalls.set(update.toolCallId, {
          toolCallId: update.toolCallId,
          title: update.title,
          kind: update.kind,
          status: update.status,
        });
        break;

      case "tool_call_update":
        if (toolCalls.has(update.toolCallId)) {
          const existing = toolCalls.get(update.toolCallId)!;
          toolCalls.set(update.toolCallId, {
            ...existing,
            ...(update.title != null ? { title: update.title } : {}),
            ...(update.kind !== undefined ? { kind: update.kind } : {}),
            ...(update.status !== undefined ? { status: update.status } : {}),
          });
        }
        break;

      case "plan":
        plan.length = 0;
        for (const entry of update.entries) {
          plan.push(entry.content);
        }
        break;
    }
  }

  return {
    text: textParts.join(""),
    toolCalls: Array.from(toolCalls.values()),
    plan: [...plan],
    updates: allUpdates,
  };
}
