import {
  type GeminiSessionUpdate,
  type GeminiAcpToolKind,
  type GeminiAcpToolStatus,
} from "../types.js";

/**
 * Summary of a tool call made during a turn.
 */
export interface GeminiToolCallSummary {
  readonly toolCallId: string;
  readonly title: string;
  readonly kind?: GeminiAcpToolKind | null;
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
 * Collect all updates from a turn into a structured result.
 * Use this when you want the final output without manually iterating updates.
 *
 * @example
 * ```ts
 * const result = await collectTurn(session.send("Explain this code"));
 * console.log(result.text);
 * console.log(`${result.toolCalls.length} tools used`);
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
