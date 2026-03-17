/**
 * gemini-acp - A Node.js library for communicating with Gemini CLI over ACP protocol
 */

// Main exports
export { createGeminiClient } from "./client";
export type { GeminiClient, GeminiSession } from "./types";

// Types
export type {
  GeminiClientOptions,
  GeminiSessionOptions,
  GeminiContentBlock,
  GeminiSessionUpdate,
  GeminiAcpPermissionRequest,
  GeminiAcpPermissionOption,
  GeminiLogger,
  GeminiAcpToolKind,
  GeminiAcpToolStatus,
  GeminiAcpToolContent,
  GeminiAcpPromptStopReason,
} from "./types";

// Errors
export {
  GeminiError,
  GeminiProcessError,
  GeminiProtocolError,
  GeminiRequestError,
  GeminiTimeoutError,
  GeminiSessionNotFoundError,
  GeminiPermissionError,
} from "./errors";

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
} from "./constants";
