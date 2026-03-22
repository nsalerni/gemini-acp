/**
 * **gemini-acp** — A Node.js library for communicating with the
 * [Gemini CLI](https://ai.google.dev/gemini-cli) over the ACP
 * (Agent Control Protocol) via stdio.
 *
 * Zero runtime dependencies. Fully typed. Stream agent responses,
 * handle tool approvals, manage sessions, and connect MCP servers.
 *
 * @example
 * ```ts
 * import { createGeminiClient } from "@nsalerni/gemini-acp";
 *
 * const client = await createGeminiClient();
 * const session = await client.openSession({ model: "gemini-3.1-flash" });
 *
 * for await (const update of session.send("Hello!")) {
 *   if (update.sessionUpdate === "agent_message_chunk") {
 *     process.stdout.write(update.content?.text ?? "");
 *   }
 * }
 *
 * await session.close();
 * await client.close();
 * ```
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

export { createGeminiClient } from "./client.js";
export { preflightGemini } from "./preflight.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { PreflightResult, PreflightOptions } from "./preflight.js";

export type {
  // Public API interfaces
  GeminiClient,
  GeminiSession,

  // Options
  GeminiClientOptions,
  GeminiSessionOptions,

  // Prompt & content
  GeminiPromptInput,
  GeminiContentBlock,

  // Session updates (streaming)
  GeminiSessionUpdate,
  GeminiAcpPromptResponse,
  GeminiAcpPromptStopReason,

  // Permissions
  GeminiAcpPermissionRequest,
  GeminiAcpPermissionOption,
  PermissionHandler,

  // Tools
  GeminiAcpToolKind,
  GeminiAcpToolStatus,
  GeminiAcpToolContent,

  // MCP
  GeminiMcpServer,

  // Observability
  GeminiClientEvent,
  GeminiLogger,
} from "./types.js";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export {
  GeminiError,
  GeminiProcessError,
  GeminiProtocolError,
  GeminiRequestError,
  GeminiTimeoutError,
  GeminiSessionClosedError,
  GeminiSessionBusyError,
} from "./errors.js";

// ---------------------------------------------------------------------------
// Constants (exported for advanced use cases)
// ---------------------------------------------------------------------------

export {
  ACP_PROTOCOL_VERSION,
  ACP_METHOD_INITIALIZE,
  ACP_METHOD_SESSION_NEW,
  ACP_METHOD_SESSION_LOAD,
  ACP_METHOD_SESSION_PROMPT,
  ACP_METHOD_SESSION_SET_MODE,
  ACP_METHOD_SESSION_SET_MODEL,
  ACP_METHOD_SESSION_CANCEL,
  ACP_METHOD_SESSION_UPDATE,
  ACP_METHOD_SESSION_REQUEST_PERMISSION,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_PROMPT_TIMEOUT_MS,
} from "./constants.js";
