#!/usr/bin/env node

/**
 * Fake ACP server for contract tests.
 *
 * Reads newline-delimited JSON-RPC from stdin, writes responses to stdout.
 * Ignores the --acp flag passed by the library's spawn call.
 *
 * No library imports — standalone script using only Node builtins.
 */

import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

// Per-session state
const sessions = new Map();

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendNotification(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

let permissionRequestIdCounter = 9000;

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }

  // --- Handle client responses to our server-initiated requests ---
  if ("id" in msg && ("result" in msg || "error" in msg)) {
    // This is a response to a request we sent (e.g. session/request_permission).
    // We resolve it via the pendingServerRequests map.
    const pending = pendingServerRequests.get(String(msg.id));
    if (pending) {
      pendingServerRequests.delete(String(msg.id));
      pending(msg);
    }
    return;
  }

  const { id, method, params } = msg;

  // Notifications (no id) — just accept silently
  if (id === undefined || id === null) {
    // e.g. session/cancel
    return;
  }

  switch (method) {
    case "initialize": {
      sendResult(id, {
        protocolVersion: 1,
        agentInfo: { name: "fake" },
        agentCapabilities: { loadSession: true },
      });
      break;
    }

    case "session/new": {
      const sessionId = randomUUID();
      sessions.set(sessionId, { mode: "yolo" });
      sendResult(id, {
        sessionId,
        modes: { currentModeId: "default" },
        models: { currentModelId: "fake-model" },
      });
      break;
    }

    case "session/load": {
      const sessionId = params?.sessionId ?? randomUUID();
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, { mode: "yolo" });
      }
      sendResult(id, {
        sessionId,
        modes: { currentModeId: "default" },
        models: { currentModelId: "fake-model" },
      });
      break;
    }

    case "session/set_mode": {
      const session = sessions.get(params?.sessionId);
      if (session) {
        session.mode = params?.modeId ?? "yolo";
      }
      sendResult(id, {});
      break;
    }

    case "session/set_model": {
      sendResult(id, {});
      break;
    }

    case "session/prompt": {
      const sessionId = params?.sessionId;
      const session = sessions.get(sessionId);

      // If mode is "plan", send a permission request to the client first
      if (session?.mode === "plan") {
        const permId = String(++permissionRequestIdCounter);
        const permissionResponsePromise = waitForServerRequest(permId);

        send({
          jsonrpc: "2.0",
          id: permId,
          method: "session/request_permission",
          params: {
            sessionId,
            options: [
              { optionId: "allow", kind: "allow_once" },
              { optionId: "deny", kind: "reject_once" },
            ],
          },
        });

        // Wait for the client to respond before continuing
        await permissionResponsePromise;
      }

      // Send a few session/update notifications
      sendNotification("session/update", {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello" },
        },
      });

      sendNotification("session/update", {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: " world" },
        },
      });

      // Send prompt response
      sendResult(id, { stopReason: "end_turn" });
      break;
    }

    default: {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
      break;
    }
  }
});

// Map for tracking server-initiated requests waiting for client responses
const pendingServerRequests = new Map();

function waitForServerRequest(id) {
  return new Promise((resolve) => {
    pendingServerRequests.set(id, resolve);
  });
}

// Gracefully handle termination
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
