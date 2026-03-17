/**
 * Example: Resume a previous session
 */

import { createGeminiClient } from "../src/index.js";

async function main() {
  const client = await createGeminiClient({
    cwd: process.cwd(),
  });

  // First, create a session and save its ID
  console.log("📝 Creating new session...");
  const session1 = await client.openSession({
    cwd: process.cwd(),
    model: "gemini-3-flash-preview",
    mode: "yolo",
  });

  const sessionId = session1.id;
  console.log("Session ID:", sessionId);

  // Send first prompt
  await session1.prompt([
    {
      type: "text",
      text: "What is the capital of France? Answer in one sentence.",
    },
  ]);

  for await (const update of session1.updates()) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }

  console.log("\n");

  // Close the first session
  await session1.close();

  // Later, resume the same session
  console.log("\n📝 Resuming session...");
  const session2 = await client.openSession({
    cwd: process.cwd(),
    resumeSessionId: sessionId,
  });

  console.log("Session resumed:", session2.id);

  // Continue the conversation
  await session2.prompt([
    {
      type: "text",
      text: "What's the population? Answer in one sentence.",
    },
  ]);

  for await (const update of session2.updates()) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }

  console.log("\n\n✨ Done");

  await session2.close();
  await client.close();
}

main().catch(console.error);
