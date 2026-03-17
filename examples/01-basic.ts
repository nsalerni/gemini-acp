/**
 * Basic example: Send a simple prompt and stream responses
 */

import { createGeminiClient } from "../src/index";

async function main() {
  // Create a client
  const client = await createGeminiClient({
    cwd: process.cwd(),
  });

  // Open a session
  const session = await client.openSession({
    cwd: process.cwd(),
    model: "gemini-3-flash-preview",
    mode: "yolo",
  });

  console.log("📝 Session opened:", session.id);

  // Send a prompt
  await session.prompt([
    {
      type: "text",
      text: "What are the top 5 TypeScript best practices? Keep your answer concise.",
    },
  ]);

  // Stream updates
  for await (const update of session.updates()) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    } else if (update.sessionUpdate === "tool_call") {
      console.log(`\n🛠️  Tool: ${update.title}`);
    } else if (update.sessionUpdate === "tool_call_update") {
      if (update.status === "completed") {
        console.log(`✅ Tool completed: ${update.title}`);
      }
    }
  }

  console.log("\n\n✨ Done");

  // Cleanup
  await session.close();
  await client.close();
}

main().catch(console.error);
