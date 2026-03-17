import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createGeminiClient, GeminiSessionClosedError } from "../index.js";
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
      (u: any) => u.sessionUpdate === "agent_message_chunk",
    );
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    await session.close();
  }, 30_000);

  it("rejects concurrent prompts", async () => {
    client = await createGeminiClient({ binaryPath: FAKE_SERVER_PATH });
    const session = await client.openSession({ mode: "yolo" });

    // Fire and forget the first prompt
    const first = session.prompt([{ type: "text", text: "one" }]);

    // The second should throw immediately
    await expect(
      session.prompt([{ type: "text", text: "two" }]),
    ).rejects.toThrow(GeminiSessionClosedError);

    await first;
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
    for await (const _update of session.updates()) {
      // drain
    }
    await promptDone;

    expect(permissionReceived).toBe(true);

    await session.close();
  }, 30_000);
});
