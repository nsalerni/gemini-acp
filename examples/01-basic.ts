/**
 * Basic example: Send a prompt and stream the response
 */

import { createGeminiClient } from "../src/index.js";

async function main() {
  const client = await createGeminiClient();
  const session = await client.openSession({ model: "gemini-3.1-flash" });

  for await (const update of session.send("What are the top 5 TypeScript best practices? Be concise.")) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }

  console.log();
  await session.close();
  await client.close();
}

main().catch(console.error);
