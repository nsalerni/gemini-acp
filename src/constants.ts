/**
 * ACP (Agent Communication Protocol) constants used throughout the library.
 *
 * Defines protocol versioning, JSON-RPC method names, timeout durations,
 * and resource limits for ACP client–server communication.
 *
 * @module constants
 */

/**
 * Current version of the ACP protocol supported by this library.
 *
 * Sent during the `initialize` handshake so the server can verify
 * compatibility.
 */
export const ACP_PROTOCOL_VERSION = 1;

/**
 * The version of the gemini-acp library, sent during ACP initialization.
 *
 * Keep in sync with the `version` field in package.json.
 */
export const LIB_VERSION = "0.1.14";

// ---------------------------------------------------------------------------
// ACP Methods
// ---------------------------------------------------------------------------

/**
 * JSON-RPC method name for the protocol initialization handshake.
 *
 * @default "initialize"
 */
export const ACP_METHOD_INITIALIZE = "initialize";

/**
 * JSON-RPC method name for creating a new agent session.
 *
 * @default "session/new"
 */
export const ACP_METHOD_SESSION_NEW = "session/new";

/**
 * JSON-RPC method name for loading (resuming) an existing session.
 *
 * @default "session/load"
 */
export const ACP_METHOD_SESSION_LOAD = "session/load";

/**
 * JSON-RPC method name for sending a prompt to an active session.
 *
 * @default "session/prompt"
 */
export const ACP_METHOD_SESSION_PROMPT = "session/prompt";

/**
 * JSON-RPC method name for changing the operating mode of a session.
 *
 * @default "session/set_mode"
 */
export const ACP_METHOD_SESSION_SET_MODE = "session/set_mode";

/**
 * JSON-RPC method name for switching the model used by a session.
 *
 * @default "session/set_model"
 */
export const ACP_METHOD_SESSION_SET_MODEL = "session/set_model";

/**
 * JSON-RPC method name for cancelling an in-progress session turn.
 *
 * @default "session/cancel"
 */
export const ACP_METHOD_SESSION_CANCEL = "session/cancel";

/**
 * JSON-RPC method name for pushing a session state update to the server.
 *
 * @default "session/update"
 */
export const ACP_METHOD_SESSION_UPDATE = "session/update";

/**
 * JSON-RPC method name for requesting permission from the server
 * (e.g. tool-use approval).
 *
 * @default "session/request_permission"
 */
export const ACP_METHOD_SESSION_REQUEST_PERMISSION = "session/request_permission";

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------

/**
 * Default timeout (in milliseconds) for generic JSON-RPC requests.
 *
 * @default 60_000 (60 seconds)
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Default timeout (in milliseconds) for prompt requests, which are expected
 * to take longer than ordinary RPC calls.
 *
 * @default 300_000 (5 minutes)
 */
export const DEFAULT_PROMPT_TIMEOUT_MS = 300_000;

/**
 * Maximum time (in milliseconds) to wait for the first piece of output
 * after a turn has been initiated. If no output arrives within this window
 * the turn is considered stalled.
 *
 * @default 120_000 (2 minutes)
 */
export const INITIAL_TURN_STALL_TIMEOUT_MS = 120_000;

/**
 * Maximum idle time (in milliseconds) allowed between successive outputs
 * during an active turn. If no new output is received within this window
 * the turn is considered idle and may be terminated.
 *
 * @default 180_000 (3 minutes)
 */
export const ACTIVE_TURN_IDLE_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Resource limits
// ---------------------------------------------------------------------------

/**
 * Maximum number of characters retained from a process's stderr output.
 * Output exceeding this limit is truncated to keep payloads manageable.
 *
 * @default 16_000
 */
export const MAX_STDERR_CHARS = 16_000;
