import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createGeminiClient, GeminiSessionClosedError, GeminiSessionBusyError } from "../index.js";
import type { GeminiClient } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE_SERVER_PATH = path.resolve(__dirname, "fake-acp-server.mjs");

// Ensure the fake server is executable
fs.chmodSync(FAKE_SERVER_PATH, 0o755);

describe("ACP contract tests", () => {
  let client: GeminiClient;

  afterEach(async () => {
    if (client) {
      await client.close();
    }
  });

  it("initializes and opens a session", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession({ mode: "yolo" });

    expect(session.id).toBeTruthy();
    expect(typeof session.id).toBe("string");

    await session.close();
  }, 30_000);

  it("opens a session with no args", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession();

    expect(session.id).toBeTruthy();
    expect(typeof session.id).toBe("string");

    await session.close();
  }, 30_000);

  it("sends a prompt and receives streaming updates", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession({ mode: "yolo" });

    const updates: unknown[] = [];

    const promptDone = session.prompt([{ type: "text", text: "Hi" }]);
    for await (const update of session.updates()) {
      updates.push(update);
    }
    await promptDone;

    const chunks = updates.filter(
      (u: unknown) => (u as { sessionUpdate?: string }).sessionUpdate === "agent_message_chunk",
    );
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    await session.close();
  }, 30_000);

  it("accepts a plain string prompt", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession({ mode: "yolo" });

    const updates: unknown[] = [];

    const promptDone = session.prompt("Hi");
    for await (const update of session.updates()) {
      updates.push(update);
    }
    await promptDone;

    const chunks = updates.filter(
      (u: unknown) => (u as { sessionUpdate?: string }).sessionUpdate === "agent_message_chunk",
    );
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    await session.close();
  }, 30_000);

  it("send() streams updates in a single call", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession({ mode: "yolo" });

    const updates: unknown[] = [];
    for await (const update of session.send("Hi")) {
      updates.push(update);
    }

    const chunks = updates.filter(
      (u: unknown) => (u as { sessionUpdate?: string }).sessionUpdate === "agent_message_chunk",
    );
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    await session.close();
  }, 30_000);

  it("prompt() returns stopReason", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession({ mode: "yolo" });

    const result = session.prompt("Hi");
    for await (const update of session.updates()) {
      void update;
    }
    const response = await result;

    expect(response.stopReason).toBe("end_turn");

    await session.close();
  }, 30_000);

  it("currentModel is set after opening a session", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession({ mode: "yolo" });

    expect(session.currentModel).toBe("fake-model");

    await session.close();
  }, 30_000);

  it("currentModel is set on resumed session", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session1 = await client.openSession({ mode: "yolo" });
    const savedId = session1.id;
    await session1.close();

    const session2 = await client.openSession({
      mode: "yolo",
      resumeSessionId: savedId,
    });

    expect(session2.currentModel).toBe("fake-model");

    await session2.close();
  }, 30_000);

  it("rejects concurrent prompts with GeminiSessionBusyError", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession({ mode: "yolo" });

    // Fire and forget the first prompt
    const first = session.prompt([{ type: "text", text: "one" }]);

    // The second should throw immediately
    await expect(
      session.prompt([{ type: "text", text: "two" }]),
    ).rejects.toThrow(GeminiSessionBusyError);

    await first;
    await session.close();
  }, 30_000);

  it("rejects second updates() consumer with GeminiSessionBusyError", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession({ mode: "yolo" });

    const promptDone = session.prompt("Hi");

    // First consumer starts
    const iter1 = session.updates()[Symbol.asyncIterator]();
    // Start consuming — this marks the session as consuming
    const firstResult = iter1.next();

    // Second consumer should reject on first .next()
    const iter2 = session.updates()[Symbol.asyncIterator]();
    await expect(iter2.next()).rejects.toThrow(GeminiSessionBusyError);

    // Drain first consumer
    await firstResult;
    let next = await iter1.next();
    while (!next.done) {
      next = await iter1.next();
    }

    await promptDone;
    await session.close();
  }, 30_000);

  it("handles session close gracefully", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession({ mode: "yolo" });

    await session.close();

    await expect(
      session.prompt([{ type: "text", text: "after close" }]),
    ).rejects.toThrow(GeminiSessionClosedError);
  }, 30_000);

  it("closed sessions are removed from client tracking", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session1 = await client.openSession({ mode: "yolo" });
    await session1.close();

    // Opening another session should work fine (no accumulation)
    const session2 = await client.openSession({ mode: "yolo" });
    expect(session2.id).toBeTruthy();
    await session2.close();
  }, 30_000);

  it("resumes a session by ID", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session1 = await client.openSession({ mode: "yolo" });
    const savedId = session1.id;
    await session1.close();

    const session2 = await client.openSession({
      mode: "yolo",
      resumeSessionId: savedId,
    });

    expect(session2.id).toBe(savedId);

    await session2.close();
  }, 30_000);

  it("handles permission requests in plan mode", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });

    let permissionReceived = false;

    const session = await client.openSession({
      mode: "plan",
      onPermissionRequest: async (request) => {
        permissionReceived = true;
        expect(request.sessionId).toBeTruthy();
        expect(request.options.length).toBeGreaterThan(0);
        return {
          outcome: { outcome: "selected", optionId: request.options[0].optionId },
        };
      },
    });

    const promptDone = session.prompt([{ type: "text", text: "plan something" }]);
    for await (const update of session.updates()) {
      // drain
      void update;
    }
    await promptDone;

    expect(permissionReceived).toBe(true);

    await session.close();
  }, 30_000);

  it("uses client-level onPermissionRequest as default", async () => {
    let clientHandlerCalled = false;

    client = await createGeminiClient({
      binaryPath: FAKE_SERVER_PATH,
      onPermissionRequest: async (request) => {
        clientHandlerCalled = true;
        const allow = request.options.find(o => o.kind === "allow_once");
        if (allow) return { outcome: { outcome: "selected", optionId: allow.optionId } };
        return { outcome: { outcome: "cancelled" } };
      },
    });

    const session = await client.openSession({ mode: "plan" });

    const promptDone = session.prompt("plan something");
    for await (const update of session.updates()) {
      void update;
    }
    await promptDone;

    expect(clientHandlerCalled).toBe(true);

    await session.close();
  }, 30_000);

  it("session-level onPermissionRequest overrides client-level", async () => {
    let clientHandlerCalled = false;
    let sessionHandlerCalled = false;

    client = await createGeminiClient({
      binaryPath: FAKE_SERVER_PATH,
      onPermissionRequest: async (request) => {
        clientHandlerCalled = true;
        const allow = request.options.find(o => o.kind === "allow_once");
        if (allow) return { outcome: { outcome: "selected", optionId: allow.optionId } };
        return { outcome: { outcome: "cancelled" } };
      },
    });

    const session = await client.openSession({
      mode: "plan",
      onPermissionRequest: async (request) => {
        sessionHandlerCalled = true;
        const allow = request.options.find(o => o.kind === "allow_once");
        if (allow) return { outcome: { outcome: "selected", optionId: allow.optionId } };
        return { outcome: { outcome: "cancelled" } };
      },
    });

    const promptDone = session.prompt("plan something");
    for await (const update of session.updates()) {
      void update;
    }
    await promptDone;

    expect(sessionHandlerCalled).toBe(true);
    expect(clientHandlerCalled).toBe(false);

    await session.close();
  }, 30_000);

  it("permission handler errors are caught gracefully", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });

    const session = await client.openSession({
      mode: "plan",
      onPermissionRequest: async () => {
        throw new Error("Handler exploded!");
      },
    });

    // Should not throw — the error is caught and permission is cancelled
    const promptDone = session.prompt("plan something");
    for await (const update of session.updates()) {
      void update;
    }
    await promptDone;

    await session.close();
  }, 30_000);
});
