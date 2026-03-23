/**
 * Core types for the Gemini ACP (Agent Control Protocol) library.
 *
 * This module defines all public and internal type definitions used across
 * the library, including JSON-RPC message types, ACP protocol types,
 * session update discriminated unions, and the public API interfaces.
 *
 * @module types
 */

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 Types
// ---------------------------------------------------------------------------

/**
 * A JSON-RPC 2.0 request/response identifier.
 *
 * Per the JSON-RPC spec, an `id` may be a string, number, or `null`.
 */
export type JsonRpcId = string | number | null;

/**
 * A JSON-RPC 2.0 request message sent by the client to the server.
 */
export interface JsonRpcRequestMessage {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
}

/**
 * A JSON-RPC 2.0 notification message (a request with no `id`).
 *
 * Notifications are fire-and-forget — the server does not send a response.
 */
export interface JsonRpcNotificationMessage {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: unknown;
}

/**
 * A JSON-RPC 2.0 error object included in error responses.
 */
export interface JsonRpcErrorObject {
  /** A numeric error code defined by the JSON-RPC spec or ACP protocol. */
  readonly code: number;
  /** A short human-readable description of the error. */
  readonly message: string;
  /** Optional structured data with additional error context. */
  readonly data?: unknown;
}

/**
 * A JSON-RPC 2.0 response message — either a success (`result`) or error (`error`).
 */
export type JsonRpcResponseMessage =
  | {
      readonly jsonrpc: "2.0";
      readonly id: JsonRpcId;
      readonly result: unknown;
    }
  | {
      readonly jsonrpc: "2.0";
      readonly id: JsonRpcId;
      readonly error: JsonRpcErrorObject;
    };

/**
 * Any JSON-RPC 2.0 message: request, notification, or response.
 */
export type JsonRpcMessage =
  | JsonRpcRequestMessage
  | JsonRpcNotificationMessage
  | JsonRpcResponseMessage;

// ---------------------------------------------------------------------------
// ACP Protocol Types
// ---------------------------------------------------------------------------

/**
 * Response payload from the ACP `initialize` handshake.
 */
export interface GeminiAcpInitializeResponse {
  /** Capabilities advertised by the Gemini CLI agent. */
  readonly agentCapabilities?: {
    /** Whether the agent supports loading (resuming) saved sessions. */
    readonly loadSession?: boolean;
  };
}

/**
 * Model state within an ACP session response.
 */
export interface GeminiAcpSessionModelState {
  /** The currently active model identifier. */
  readonly currentModelId?: string;
}

/**
 * Response payload from ACP `session/new` or `session/load` methods.
 */
export interface GeminiAcpSessionResponse {
  /** The unique session identifier assigned by the Gemini CLI. */
  readonly sessionId?: string;
  /** Current model state for the session. */
  readonly models?: GeminiAcpSessionModelState;
}

/**
 * The reason a prompt turn stopped executing.
 *
 * - `"end_turn"` — The agent finished responding naturally.
 * - `"max_tokens"` — The response hit the token limit.
 * - `"max_turn_requests"` — The maximum number of tool-use turns was reached.
 * - `"refusal"` — The agent refused the prompt.
 * - `"cancelled"` — The prompt was cancelled by the client.
 */
export type GeminiAcpPromptStopReason =
  | "end_turn"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";

/**
 * Response payload from the ACP `session/prompt` method.
 */
export interface GeminiAcpPromptResponse {
  /** The reason the agent stopped generating for this turn. */
  readonly stopReason: GeminiAcpPromptStopReason;
}

// ---------------------------------------------------------------------------
// Content Types
// ---------------------------------------------------------------------------

/**
 * A content block within a prompt or agent response.
 *
 * - `type: "text"` — A plain-text content block.
 * - `type: "image"` — A base64-encoded image content block.
 */
export type GeminiContentBlock =
  | {
      readonly type: "text";
      /** The text content. */
      readonly text: string;
    }
  | {
      readonly type: "image";
      /** The MIME type of the image (e.g., `"image/png"`). */
      readonly mimeType: string;
      /** Base64-encoded image data. */
      readonly data: string;
    };

// ---------------------------------------------------------------------------
// Tool Types
// ---------------------------------------------------------------------------

/**
 * The category of a tool call made by the agent.
 */
export type GeminiAcpToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

/**
 * The execution status of a tool call.
 */
export type GeminiAcpToolStatus = "pending" | "in_progress" | "completed" | "failed";

/**
 * Content produced by a tool call.
 *
 * - `type: "content"` — Free-form text content from the tool.
 * - `type: "diff"` — A file diff produced by an edit tool.
 * - `type: "terminal"` — A reference to terminal output.
 */
export type GeminiAcpToolContent =
  | {
      readonly type: "content";
      readonly content?: {
        readonly type?: string;
        readonly text?: string;
      };
    }
  | {
      readonly type: "diff";
      /** The file path that was modified. */
      readonly path: string;
      /** The original file content (before the edit), or `null` for new files. */
      readonly oldText?: string | null;
      /** The new file content (after the edit). */
      readonly newText: string;
    }
  | {
      readonly type: "terminal";
      /** The identifier of the terminal that produced output. */
      readonly terminalId: string;
    };

// ---------------------------------------------------------------------------
// Session Update Types (Discriminated Union)
// ---------------------------------------------------------------------------

/**
 * A real-time update received during an active session turn.
 *
 * Discriminated on the `sessionUpdate` field:
 *
 * - `"agent_message_chunk"` — A chunk of the agent's text response.
 * - `"agent_thought_chunk"` — A chunk of the agent's internal reasoning.
 * - `"user_message_chunk"` — A chunk of the user's echoed message.
 * - `"tool_call"` — A new tool call initiated by the agent.
 * - `"tool_call_update"` — A progress update for an existing tool call.
 * - `"plan"` — The agent's proposed plan (in plan mode).
 * - `"session_info_update"` — Session metadata changes (title, timestamp).
 * - `"current_mode_update"` — The session mode changed.
 * - `"available_commands_update"` — Available commands changed.
 * - `"config_option_update"` — Configuration options changed.
 */
export type GeminiSessionUpdate =
  | {
      readonly sessionUpdate: "agent_message_chunk" | "agent_thought_chunk" | "user_message_chunk";
      readonly content?: {
        readonly type?: string;
        readonly text?: string;
      };
    }
  | {
      readonly sessionUpdate: "tool_call";
      /** Unique identifier for this tool call. */
      readonly toolCallId: string;
      /** Current execution status of the tool call. */
      readonly status?: GeminiAcpToolStatus | null;
      /** Human-readable title of the tool call. */
      readonly title: string;
      /** The category of tool being invoked. */
      readonly kind?: GeminiAcpToolKind | null;
      /** Content produced by the tool call. */
      readonly content?: ReadonlyArray<GeminiAcpToolContent> | null;
      /** The raw input passed to the tool. */
      readonly rawInput?: unknown;
      /** The raw output returned by the tool. */
      readonly rawOutput?: unknown;
      /** File locations associated with the tool call. */
      readonly locations?: ReadonlyArray<{
        readonly path: string;
        readonly line?: number | null;
      }> | null;
    }
  | {
      readonly sessionUpdate: "tool_call_update";
      /** The tool call ID this update applies to. */
      readonly toolCallId: string;
      readonly status?: GeminiAcpToolStatus | null;
      readonly title?: string | null;
      readonly kind?: GeminiAcpToolKind | null;
      readonly content?: ReadonlyArray<GeminiAcpToolContent> | null;
      readonly rawInput?: unknown;
      readonly rawOutput?: unknown;
      readonly locations?: ReadonlyArray<{
        readonly path: string;
        readonly line?: number | null;
      }> | null;
    }
  | {
      readonly sessionUpdate: "plan";
      /** Ordered list of plan entries. */
      readonly entries: ReadonlyArray<{
        /** The plan step description. */
        readonly content: string;
        /** Current status of this plan step. */
        readonly status: "pending" | "in_progress" | "completed";
      }>;
    }
  | {
      readonly sessionUpdate: "session_info_update";
      /** Updated session title, or `null` if cleared. */
      readonly title?: string | null;
      /** ISO 8601 timestamp of the last update. */
      readonly updatedAt?: string | null;
    }
  | {
      readonly sessionUpdate: "current_mode_update";
      /** The new active mode identifier. */
      readonly currentModeId: string;
    }
  | {
      readonly sessionUpdate: "available_commands_update" | "config_option_update";
      readonly [key: string]: unknown;
    };

// ---------------------------------------------------------------------------
// Permission Types
// ---------------------------------------------------------------------------

/**
 * A single permission option presented to the user for a tool approval request.
 */
export interface GeminiAcpPermissionOption {
  /** Unique identifier for this option. */
  readonly optionId: string;
  /** The kind of permission action this option represents. */
  readonly kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

/**
 * A permission request from the Gemini CLI agent, asking the client
 * to approve or reject a tool call.
 */
export interface GeminiAcpPermissionRequest {
  /** The session ID this permission request belongs to. */
  readonly sessionId: string;
  /** Available permission options to choose from. */
  readonly options: ReadonlyArray<GeminiAcpPermissionOption>;
}

/**
 * Envelope wrapping a session update notification from the ACP server.
 */
export interface GeminiAcpNotificationEnvelope {
  /** The session this update belongs to. */
  readonly sessionId?: string;
  /** The session update payload. */
  readonly update?: GeminiSessionUpdate;
}

// ---------------------------------------------------------------------------
// Logger Interface
// ---------------------------------------------------------------------------

/**
 * Optional logger interface for diagnostic output.
 *
 * All methods are optional — the library gracefully handles missing methods.
 * Compatible with most logging libraries (winston, pino, console, etc.).
 *
 * @example
 * ```ts
 * const logger: GeminiLogger = {
 *   debug: (msg, meta) => console.debug(msg, meta),
 *   info: (msg, meta) => console.info(msg, meta),
 *   warn: (msg, meta) => console.warn(msg, meta),
 *   error: (msg, meta) => console.error(msg, meta),
 * };
 * ```
 */
export interface GeminiLogger {
  debug?(message: string, meta?: unknown): void;
  info?(message: string, meta?: unknown): void;
  warn?(message: string, meta?: unknown): void;
  error?(message: string, meta?: unknown): void;
}

// ---------------------------------------------------------------------------
// MCP Server Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for an MCP (Model Context Protocol) tool server
 * to connect to a Gemini session.
 */
export interface GeminiMcpServer {
  /** A unique name identifying this MCP server. */
  readonly name: string;
  /** The command to execute to start the MCP server. */
  readonly command: string;
  /** Command-line arguments to pass to the server process. */
  readonly args?: readonly string[];
  /** Environment variables to set for the server process. */
  readonly env?: Readonly<Record<string, string>>;
  /** Working directory for the server process. */
  readonly cwd?: string;
}

// ---------------------------------------------------------------------------
// Client Event Types (Observability)
// ---------------------------------------------------------------------------

/**
 * Structured lifecycle events emitted by the client for observability.
 *
 * Subscribe via `GeminiClientOptions.onEvent` to track process lifecycle,
 * session management, prompt execution, and permission handling.
 *
 * Discriminated on the `type` field.
 */
export type GeminiClientEvent =
  | { readonly type: "process_started"; readonly binaryPath: string; readonly cwd: string }
  | { readonly type: "process_exited"; readonly code: number | null; readonly signal: string | null }
  | { readonly type: "session_opened"; readonly sessionId: string; readonly model?: string; readonly warm: boolean }
  | { readonly type: "session_closed"; readonly sessionId: string }
  | { readonly type: "prompt_started"; readonly sessionId: string }
  | { readonly type: "prompt_completed"; readonly sessionId: string; readonly stopReason: GeminiAcpPromptStopReason }
  | { readonly type: "prompt_failed"; readonly sessionId: string; readonly error: string }
  | { readonly type: "permission_requested"; readonly sessionId: string }
  | { readonly type: "permission_resolved"; readonly sessionId: string; readonly outcome: "selected" | "cancelled" }
  | { readonly type: "warm_session_ready"; readonly sessionId: string }
  | { readonly type: "warm_session_consumed"; readonly sessionId: string }
  | { readonly type: "warm_session_failed"; readonly error: string };

// ---------------------------------------------------------------------------
// Permission Handler
// ---------------------------------------------------------------------------

/**
 * Callback invoked when the Gemini CLI agent requests permission to execute a tool.
 *
 * Return `"selected"` with an `optionId` to approve, or `"cancelled"` to deny.
 *
 * @param request - The permission request containing session ID and available options.
 * @returns A promise resolving to the selected outcome.
 *
 * @example
 * ```ts
 * const handler: PermissionHandler = async (request) => {
 *   const allow = request.options.find(o => o.kind === "allow_once");
 *   if (allow) return { outcome: { outcome: "selected", optionId: allow.optionId } };
 *   return { outcome: { outcome: "cancelled" } };
 * };
 * ```
 */
export type PermissionHandler = (
  request: GeminiAcpPermissionRequest
) => Promise<{
  outcome: {
    outcome: "selected" | "cancelled";
    optionId?: string;
  };
}>;

// ---------------------------------------------------------------------------
// Public API — Client Options
// ---------------------------------------------------------------------------

/**
 * Configuration options for creating a {@link GeminiClient}.
 *
 * All fields are optional — sensible defaults are applied.
 */
export interface GeminiClientOptions {
  /**
   * Path to the Gemini CLI binary.
   *
   * @defaultValue `"gemini"` (resolved via `PATH`)
   */
  binaryPath?: string;

  /**
   * Extra arguments to pass to the Gemini CLI binary.
   *
   * These are inserted before the `--acp` flag so that wrapper scripts
   * can use `--` as a separator if needed.
   */
  readonly args?: readonly string[];

  /**
   * Working directory for the Gemini CLI process.
   *
   * @defaultValue `process.cwd()`
   */
  cwd?: string;

  /**
   * Environment variables to pass to the Gemini CLI process.
   * If omitted, the process inherits the parent's environment.
   */
  env?: NodeJS.ProcessEnv;

  /**
   * Optional logger instance for diagnostic output.
   * All logger methods are optional.
   */
  logger?: GeminiLogger;

  /**
   * Callback invoked when a protocol-level error occurs
   * (e.g., malformed JSON-RPC messages from the CLI).
   *
   * @param error - The protocol error.
   */
  onProtocolError?: (error: Error) => void;

  /**
   * Default permission handler applied to all sessions.
   * Can be overridden per-session via {@link GeminiSessionOptions.onPermissionRequest}.
   */
  onPermissionRequest?: PermissionHandler;

  /**
   * Callback for structured lifecycle events (observability).
   *
   * @param event - The lifecycle event.
   */
  onEvent?: (event: GeminiClientEvent) => void;

  /**
   * MCP tool servers to register with all sessions by default.
   * Can be overridden per-session via {@link GeminiSessionOptions.mcpServers}.
   */
  mcpServers?: readonly GeminiMcpServer[];

  /**
   * Default prompt timeout in milliseconds.
   * Can be overridden per-session via {@link GeminiSessionOptions.promptTimeoutMs}.
   *
   * When `undefined` (the default), prompts run indefinitely until the
   * agent finishes or the caller invokes {@link GeminiSession.cancel}.
   *
   * @defaultValue `undefined` (no timeout)
   */
  promptTimeoutMs?: number;

  /**
   * Enable warm session pre-initialization.
   *
   * When `true`, starts a background session on initialization so that
   * the first call to {@link GeminiClient.openSession} is near-instant.
   *
   * @defaultValue `false`
   */
  warmStart?: boolean;

  /**
   * Timeout in milliseconds for warm session startup.
   * Only used when {@link warmStart} is `true`.
   *
   * @defaultValue `30_000`
   */
  warmStartTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Public API — Session Options
// ---------------------------------------------------------------------------

/**
 * Configuration options for opening a {@link GeminiSession}.
 *
 * All fields are optional — defaults are inherited from the client.
 */
export interface GeminiSessionOptions {
  /**
   * Working directory for the session.
   *
   * @defaultValue Inherited from the client's `cwd`.
   */
  cwd?: string;

  /**
   * An existing session ID to resume.
   * If omitted, a new session is created.
   */
  resumeSessionId?: string;

  /**
   * The model ID to use for this session.
   * Can be changed later via {@link GeminiSession.setModel}.
   */
  model?: string;

  /**
   * Session mode.
   * - `"yolo"` — Agent executes tools immediately (default).
   * - `"plan"` — Agent proposes a plan; tools require approval.
   *
   * @defaultValue `"yolo"`
   */
  mode?: "yolo" | "plan";

  /**
   * Permission handler for this session.
   * Overrides the client-level {@link GeminiClientOptions.onPermissionRequest}.
   */
  onPermissionRequest?: PermissionHandler;

  /**
   * MCP tool servers for this session.
   * Overrides the client-level {@link GeminiClientOptions.mcpServers}.
   */
  mcpServers?: readonly GeminiMcpServer[];

  /**
   * Prompt timeout in milliseconds for this session.
   * Overrides the client-level {@link GeminiClientOptions.promptTimeoutMs}.
   *
   * When `undefined`, inherits the client default (no timeout unless configured).
   */
  promptTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Public API — Prompt Input
// ---------------------------------------------------------------------------

/**
 * Input for a prompt — either a plain string (sent as a single text block)
 * or an array of content blocks for multi-modal prompts.
 *
 * @example
 * ```ts
 * // Plain text
 * session.send("Explain this code");
 *
 * // Multi-modal with image
 * session.send([
 *   { type: "text", text: "What's in this image?" },
 *   { type: "image", mimeType: "image/png", data: base64Data },
 * ]);
 * ```
 */
export type GeminiPromptInput = string | readonly GeminiContentBlock[];

// ---------------------------------------------------------------------------
// Public API — Session Interface
// ---------------------------------------------------------------------------

/**
 * A Gemini CLI session for sending prompts and receiving streaming updates.
 *
 * Sessions are created via {@link GeminiClient.openSession} and can be
 * resumed by passing a `resumeSessionId`.
 *
 * @example
 * ```ts
 * const session = await client.openSession({ model: "gemini-3.1-flash" });
 *
 * for await (const update of session.send("Hello!")) {
 *   if (update.sessionUpdate === "agent_message_chunk") {
 *     process.stdout.write(update.content?.text ?? "");
 *   }
 * }
 *
 * await session.close();
 * ```
 */
export interface GeminiSession {
  /**
   * The unique session identifier assigned by the Gemini CLI.
   */
  readonly id: string;

  /**
   * The currently selected model ID, or `undefined` if not yet determined.
   */
  readonly currentModel?: string;

  /**
   * Send a prompt and return an async iterable of session updates.
   *
   * This is the recommended way to interact with the agent — it sends the prompt
   * and returns a stream of all updates for the turn in a single call.
   *
   * @param input - The prompt text or content blocks to send.
   * @returns An async iterable yielding session updates until the turn completes.
   * @throws {GeminiSessionClosedError} If the session has been closed.
   * @throws {GeminiSessionBusyError} If another prompt is already in progress.
   *
   * @example
   * ```ts
   * for await (const update of session.send("Explain this code")) {
   *   if (update.sessionUpdate === "agent_message_chunk") {
   *     process.stdout.write(update.content?.text ?? "");
   *   }
   * }
   * ```
   */
  send(input: GeminiPromptInput): AsyncIterable<GeminiSessionUpdate>;

  /**
   * Send a prompt and wait for the turn to complete.
   *
   * Returns the prompt response including the stop reason.
   * Use this with {@link updates} when you need separate control over
   * prompt submission and update consumption.
   *
   * @param input - The prompt text or content blocks to send.
   * @returns The prompt response with the stop reason.
   * @throws {GeminiSessionClosedError} If the session has been closed.
   * @throws {GeminiSessionBusyError} If another prompt is already in progress.
   * @throws {GeminiTimeoutError} If the prompt exceeds the configured timeout.
   */
  prompt(input: GeminiPromptInput): Promise<GeminiAcpPromptResponse>;

  /**
   * Change the session mode.
   *
   * @param mode - The new mode: `"yolo"` for auto-execute or `"plan"` for approval-required.
   * @throws {GeminiSessionClosedError} If the session has been closed.
   */
  setMode(mode: "yolo" | "plan"): Promise<void>;

  /**
   * Switch to a different model.
   *
   * @param modelId - The model identifier to switch to.
   * @throws {GeminiSessionClosedError} If the session has been closed.
   */
  setModel(modelId: string): Promise<void>;

  /**
   * Cancel the currently running prompt.
   *
   * This is a no-op if no prompt is in progress or the session is closed.
   */
  cancel(): Promise<void>;

  /**
   * Get an async iterable of updates for the current turn.
   *
   * Typically used with {@link prompt} for low-level control over
   * prompt submission and update consumption.
   *
   * Only one consumer may iterate updates at a time per turn.
   *
   * @returns An async iterable yielding session updates until the turn completes.
   * @throws {GeminiSessionBusyError} If another consumer is already iterating updates.
   */
  updates(): AsyncIterable<GeminiSessionUpdate>;

  /**
   * Close the session.
   *
   * Detaches the local route from the broker. The remote session
   * remains resumable via {@link GeminiClient.openSession} with `resumeSessionId`.
   */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Public API — Client Interface
// ---------------------------------------------------------------------------

/**
 * The main entry point for interacting with the Gemini CLI over ACP.
 *
 * A client manages a single Gemini CLI child process and multiplexes
 * multiple sessions over it.
 *
 * Create a client with {@link createGeminiClient}.
 *
 * @example
 * ```ts
 * import { createGeminiClient } from "@nsalerni/gemini-acp";
 *
 * const client = await createGeminiClient();
 * const session = await client.openSession({ model: "gemini-3.1-flash" });
 *
 * for await (const update of session.send("Hello!")) {
 *   // handle updates...
 * }
 *
 * await session.close();
 * await client.close();
 * ```
 */
export interface GeminiClient {
  /**
   * Open a new session or resume an existing one.
   *
   * @param options - Session configuration. All fields are optional.
   * @returns The opened session.
   * @throws {GeminiProcessError} If the client is closed or the broker cannot start.
   */
  openSession(options?: GeminiSessionOptions): Promise<GeminiSession>;

  /**
   * Send a raw ACP JSON-RPC request.
   *
   * Use this escape hatch to call ACP methods that the library
   * doesn't wrap yet.
   *
   * **Note:** The response type `T` is not validated at runtime.
   *
   * @typeParam T - The expected response type (not runtime-validated).
   * @param method - The ACP method name (e.g., `"session/some_new_method"`).
   * @param params - The method parameters.
   * @param timeoutMs - Optional request timeout in milliseconds.
   * @returns The parsed response.
   * @throws {GeminiProcessError} If the client is closed.
   * @throws {GeminiTimeoutError} If the request times out.
   * @throws {GeminiRequestError} If the ACP method returns an error.
   */
  rawRequest<T = unknown>(method: string, params: unknown, timeoutMs?: number): Promise<T>;

  /**
   * Gracefully shut down the client, close all sessions,
   * and terminate the Gemini CLI process.
   */
  close(): Promise<void>;

  /**
   * A promise that resolves when the underlying Gemini CLI process has exited.
   */
  readonly closed: Promise<void>;

  /**
   * Whether the client has been closed.
   */
  readonly isClosed: boolean;
}
