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
   * Callback for handling permission requests
   */
  onPermissionRequest?: (
    request: GeminiAcpPermissionRequest
  ) => Promise<{
    outcome: {
      outcome: "selected" | "cancelled";
      optionId?: string;
    };
  }>;
}

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
   * Send a prompt and stream updates back
   */
  prompt(blocks: readonly GeminiContentBlock[]): Promise<void>;

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
   * Get an async iterable of all updates from the agent
   */
  updates(): AsyncIterable<GeminiSessionUpdate>;

  /**
   * Close the session (detaches local route; remote session remains resumable)
   */
  close(): Promise<void>;
}

export interface GeminiClient {
  /**
   * Open a new session or resume an existing one
   */
  openSession(options: GeminiSessionOptions): Promise<GeminiSession>;

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
