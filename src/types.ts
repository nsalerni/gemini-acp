/**
 * Core types for the Gemini ACP protocol
 */

// JSON-RPC types
export type JsonRpcId = string | number | null;

export interface JsonRpcRequestMessage {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcNotificationMessage {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

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

export type JsonRpcMessage =
  | JsonRpcRequestMessage
  | JsonRpcNotificationMessage
  | JsonRpcResponseMessage;

// Gemini ACP types
export interface GeminiAcpInitializeResponse {
  readonly agentCapabilities?: {
    readonly loadSession?: boolean;
  };
}

export interface GeminiAcpSessionModelState {
  readonly currentModelId?: string;
}

export interface GeminiAcpSessionResponse {
  readonly sessionId?: string;
  readonly models?: GeminiAcpSessionModelState;
}

export type GeminiAcpPromptStopReason =
  | "end_turn"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";

export interface GeminiAcpPromptResponse {
  readonly stopReason: GeminiAcpPromptStopReason;
}

export type GeminiContentBlock =
  | {
      readonly type: "text";
      readonly text: string;
    }
  | {
      readonly type: "image";
      readonly mimeType: string;
      readonly data: string;
    };

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

export type GeminiAcpToolStatus = "pending" | "in_progress" | "completed" | "failed";

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
      readonly path: string;
      readonly oldText?: string | null;
      readonly newText: string;
    }
  | {
      readonly type: "terminal";
      readonly terminalId: string;
    };

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
      readonly toolCallId: string;
      readonly status?: GeminiAcpToolStatus | null;
      readonly title: string;
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
      readonly sessionUpdate: "tool_call_update";
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
      readonly entries: ReadonlyArray<{
        readonly content: string;
        readonly status: "pending" | "in_progress" | "completed";
      }>;
    }
  | {
      readonly sessionUpdate: "session_info_update";
      readonly title?: string | null;
      readonly updatedAt?: string | null;
    }
  | {
      readonly sessionUpdate: "current_mode_update";
      readonly currentModeId: string;
    }
  | {
      readonly sessionUpdate: "available_commands_update" | "config_option_update";
      readonly [key: string]: unknown;
    };

export interface GeminiAcpPermissionOption {
  readonly optionId: string;
  readonly kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

export interface GeminiAcpPermissionRequest {
  readonly sessionId: string;
  readonly options: ReadonlyArray<GeminiAcpPermissionOption>;
}

export interface GeminiAcpNotificationEnvelope {
  readonly sessionId?: string;
  readonly update?: GeminiSessionUpdate;
}

// Logger interface
export interface GeminiLogger {
  debug?(message: string, meta?: unknown): void;
  info?(message: string, meta?: unknown): void;
  warn?(message: string, meta?: unknown): void;
  error?(message: string, meta?: unknown): void;
}

// MCP server configuration
export interface GeminiMcpServer {
  readonly name: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

// Client event types for observability
export type GeminiClientEvent =
  | { readonly type: "process_started"; readonly binaryPath: string; readonly cwd: string }
  | { readonly type: "process_exited"; readonly code: number | null; readonly signal: string | null }
  | { readonly type: "session_opened"; readonly sessionId: string; readonly model?: string; readonly warm: boolean }
  | { readonly type: "session_closed"; readonly sessionId: string }
  | { readonly type: "prompt_started"; readonly sessionId: string }
  | { readonly type: "prompt_completed"; readonly sessionId: string; readonly stopReason: string }
  | { readonly type: "prompt_failed"; readonly sessionId: string; readonly error: string }
  | { readonly type: "permission_requested"; readonly sessionId: string }
  | { readonly type: "permission_resolved"; readonly sessionId: string; readonly outcome: string }
  | { readonly type: "warm_session_ready"; readonly sessionId: string }
  | { readonly type: "warm_session_consumed"; readonly sessionId: string }
  | { readonly type: "warm_session_failed"; readonly error: string };

// Permission handler type
export type PermissionHandler = (
  request: GeminiAcpPermissionRequest
) => Promise<{
  outcome: {
    outcome: "selected" | "cancelled";
    optionId?: string;
  };
}>;

// Public API types
export interface GeminiClientOptions {
  /**
   * Path to gemini binary. Defaults to "gemini" (uses PATH)
   */
  binaryPath?: string;

  /**
   * Working directory for the Gemini CLI process. Defaults to process.cwd()
   */
  cwd?: string;

  /**
   * Environment variables to pass to the process
   */
  env?: NodeJS.ProcessEnv;

  /**
   * Optional logger instance
   */
  logger?: GeminiLogger;

  /**
   * Callback for protocol-level errors
   */
  onProtocolError?: (error: Error) => void;

  /**
   * Default callback for handling permission requests across all sessions.
   * Can be overridden per-session via GeminiSessionOptions.onPermissionRequest.
   */
  onPermissionRequest?: PermissionHandler;

  /**
   * Callback for structured lifecycle events (observability).
   */
  onEvent?: (event: GeminiClientEvent) => void;

  /**
   * MCP servers to register with all sessions by default.
   * Can be overridden per-session via GeminiSessionOptions.mcpServers.
   */
  mcpServers?: readonly GeminiMcpServer[];

  /**
   * Default prompt timeout in milliseconds. Defaults to 300000 (5 minutes).
   * Can be overridden per-session via GeminiSessionOptions.promptTimeoutMs.
   */
  promptTimeoutMs?: number;

  /**
   * Enable warm session starting.
   * When true, starts a background session on initialization for faster first prompts.
   * Defaults to false
   */
  warmStart?: boolean;

  /**
   * Timeout for warm session startup in milliseconds. Defaults to 30000
   * Only used if warmStart is true
   */
  warmStartTimeoutMs?: number;
}

export interface GeminiSessionOptions {
  /**
   * Working directory for the session. Defaults to the client's cwd.
   */
  cwd?: string;

  /**
   * Session ID to resume. If not provided, creates a new session
   */
  resumeSessionId?: string;

  /**
   * Model ID to use. Can be changed later with setModel()
   */
  model?: string;

  /**
   * Session mode: "yolo" for full-access, "plan" for approval-required
   */
  mode?: "yolo" | "plan";

  /**
   * Callback for handling permission requests. Overrides client-level handler.
   */
  onPermissionRequest?: PermissionHandler;

  /**
   * MCP servers to register with this session. Overrides client-level mcpServers.
   */
  mcpServers?: readonly GeminiMcpServer[];

  /**
   * Prompt timeout in milliseconds. Overrides client-level promptTimeoutMs.
   */
  promptTimeoutMs?: number;
}

/**
 * A prompt can be a plain string (sent as a single text block) or an array of content blocks.
 */
export type GeminiPromptInput = string | readonly GeminiContentBlock[];

export interface GeminiSession {
  /**
   * The unique session ID
   */
  readonly id: string;

  /**
   * Currently selected model (if any)
   */
  readonly currentModel?: string;

  /**
   * Send a prompt and return a stream of updates.
   * This is the recommended way to interact with the agent — it sends the prompt
   * and returns an async iterable of all updates for the turn in a single call.
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
   * Returns the prompt response including the stop reason.
   * Use this with `updates()` when you need separate control over prompt submission
   * and update consumption.
   */
  prompt(input: GeminiPromptInput): Promise<GeminiAcpPromptResponse>;

  /**
   * Change session mode
   */
  setMode(mode: "yolo" | "plan"): Promise<void>;

  /**
   * Switch to a different model
   */
  setModel(modelId: string): Promise<void>;

  /**
   * Cancel the currently running prompt
   */
  cancel(): Promise<void>;

  /**
   * Get an async iterable of updates for the current turn.
   * Typically used with `prompt()` for low-level control.
   */
  updates(): AsyncIterable<GeminiSessionUpdate>;

  /**
   * Close the session (detaches local route; remote session remains resumable)
   */
  close(): Promise<void>;
}

export interface GeminiClient {
  /**
   * Open a new session or resume an existing one.
   * All options are optional — defaults to the client's cwd and yolo mode.
   */
  openSession(options?: GeminiSessionOptions): Promise<GeminiSession>;

  /**
   * Send a raw ACP JSON-RPC request. Use this to access new ACP methods
   * that the library doesn't wrap yet.
   */
  rawRequest<T = unknown>(method: string, params: unknown, timeoutMs?: number): Promise<T>;

  /**
   * Gracefully shut down the client and terminate the Gemini CLI process
   */
  close(): Promise<void>;

  /**
   * A promise that resolves when the process has exited
   */
  readonly closed: Promise<void>;

  /**
   * Check if the client is already closed
   */
  readonly isClosed: boolean;
}
