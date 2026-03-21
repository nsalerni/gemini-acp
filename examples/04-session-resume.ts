/**
 * Example: Resume a previous session to continue a conversation
 */

import { createGeminiClient } from "../src/index.js";

async function main() {
  const client = await createGeminiClient();

  // First turn
  const session1 = await client.openSession({ model: "gemini-3.1-flash" });
  console.log("Session ID:", session1.id);

  for await (const update of session1.send("What is the capital of France? One sentence.")) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }
  console.log("\n");

  const savedId = session1.id;
  await session1.close();

  // Resume and continue
  const session2 = await client.openSession({ resumeSessionId: savedId });

  for await (const update of session2.send("What's the population? One sentence.")) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }
  console.log();

  await session2.close();
  await client.close();
}

main().catch(console.error);
