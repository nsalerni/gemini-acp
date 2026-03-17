/**
 * ACP protocol constants
 */

export const ACP_PROTOCOL_VERSION = 1;

// ACP Methods
export const ACP_METHOD_INITIALIZE = "initialize";
export const ACP_METHOD_SESSION_NEW = "session/new";
export const ACP_METHOD_SESSION_LOAD = "session/load";
export const ACP_METHOD_SESSION_PROMPT = "session/prompt";
export const ACP_METHOD_SESSION_SET_MODE = "session/set_mode";
export const ACP_METHOD_SESSION_SET_MODEL = "session/set_model";
export const ACP_METHOD_SESSION_CANCEL = "session/cancel";
export const ACP_METHOD_SESSION_UPDATE = "session/update";
export const ACP_METHOD_SESSION_REQUEST_PERMISSION = "session/request_permission";

// Timeouts
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const INITIAL_TURN_STALL_TIMEOUT_MS = 120_000;
export const ACTIVE_TURN_IDLE_TIMEOUT_MS = 180_000;

// Resource limits
export const MAX_STDERR_CHARS = 16_000;
