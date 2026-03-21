/**
 * gemini-acp - A Node.js library for communicating with Gemini CLI over ACP protocol
 */

// Main exports
export { createGeminiClient } from "./client.js";
export type { GeminiClient, GeminiSession } from "./types.js";

// Types
export type {
  GeminiClientOptions,
  GeminiSessionOptions,
  GeminiPromptInput,
  GeminiContentBlock,
  GeminiSessionUpdate,
  GeminiAcpPermissionRequest,
  GeminiAcpPermissionOption,
  GeminiAcpPromptResponse,
  PermissionHandler,
  GeminiLogger,
  GeminiAcpToolKind,
  GeminiAcpToolStatus,
  GeminiAcpToolContent,
  GeminiAcpPromptStopReason,
} from "./types.js";

// Errors
export {
  GeminiError,
  GeminiProcessError,
  GeminiProtocolError,
  GeminiRequestError,
  GeminiTimeoutError,
  GeminiSessionClosedError,
  GeminiSessionBusyError,
} from "./errors.js";

// Constants (exported for advanced use cases)
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
