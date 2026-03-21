/**
 * Benchmarks for JSON-RPC message parsing — the hot path for every
 * message received from the Gemini CLI over stdout.
 */

import { bench, describe } from "vitest";

// ── Fixtures ────────────────────────────────────────────────────────────────

const RESPONSE_SUCCESS = JSON.stringify({
  jsonrpc: "2.0",
  id: "42",
  result: { stopReason: "end_turn" },
});

const RESPONSE_ERROR = JSON.stringify({
  jsonrpc: "2.0",
  id: "42",
  error: { code: -32600, message: "Invalid request", data: { detail: "missing field" } },
});

const NOTIFICATION_SMALL = JSON.stringify({
  jsonrpc: "2.0",
  method: "session/update",
  params: {
    sessionId: "abc-123",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello" },
    },
  },
});

const NOTIFICATION_TOOL_CALL = JSON.stringify({
  jsonrpc: "2.0",
  method: "session/update",
  params: {
    sessionId: "abc-123",
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "tc-1",
      title: "read_file",
      kind: "read",
      status: "in_progress",
      content: [{ type: "content", content: { type: "text", text: "Reading file..." } }],
      locations: [{ path: "/src/index.ts", line: 42 }],
    },
  },
});

// Simulate a large agent message (4 KB of text)
const LARGE_TEXT = "x".repeat(4096);
const NOTIFICATION_LARGE = JSON.stringify({
  jsonrpc: "2.0",
  method: "session/update",
  params: {
    sessionId: "abc-123",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: LARGE_TEXT },
    },
  },
});

// ── Parse + classify (mirrors JsonRpcStdioClient.handleLine logic) ───────

function parseAndClassify(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "empty";

  const parsed = JSON.parse(trimmed);
  if (typeof parsed !== "object" || parsed === null) return "non-object";

  const message = parsed as Record<string, unknown>;

  if ("id" in message && ("result" in message || "error" in message)) {
    return "response";
  }
  if ("method" in message && "id" in message) {
    return "request";
  }
  if ("method" in message) {
    return "notification";
  }
  return "unknown";
}

// ── Benchmarks ──────────────────────────────────────────────────────────────

describe("JSON-RPC parsing", () => {
  bench("parse success response", () => {
    parseAndClassify(RESPONSE_SUCCESS);
  });

  bench("parse error response", () => {
    parseAndClassify(RESPONSE_ERROR);
  });

  bench("parse small notification (agent_message_chunk)", () => {
    parseAndClassify(NOTIFICATION_SMALL);
  });

  bench("parse tool_call notification", () => {
    parseAndClassify(NOTIFICATION_TOOL_CALL);
  });

  bench("parse large notification (4KB text)", () => {
    parseAndClassify(NOTIFICATION_LARGE);
  });
});

describe("JSON serialization (outbound)", () => {
  const request = {
    jsonrpc: "2.0" as const,
    id: "1",
    method: "session/prompt",
    params: {
      sessionId: "abc-123",
      prompt: [{ type: "text", text: "Hello world" }],
    },
  };

  const requestLarge = {
    jsonrpc: "2.0" as const,
    id: "1",
    method: "session/prompt",
    params: {
      sessionId: "abc-123",
      prompt: [{ type: "text", text: LARGE_TEXT }],
    },
  };

  bench("serialize small request", () => {
    JSON.stringify(request);
  });

  bench("serialize large request (4KB prompt)", () => {
    JSON.stringify(requestLarge);
  });
});
