/**
 * Example: Warm start for fast first prompts
 *
 * When warmStart is enabled, a background session is created on init
 * so the first openSession() is near-instant.
 */

import { createGeminiClient } from "../src/index.js";

async function main() {
  const client = await createGeminiClient({
    warmStart: true,
    warmStartTimeoutMs: 30_000,
  });

  // Let the warm session initialize
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const t0 = Date.now();
  const session = await client.openSession({ model: "gemini-3.1-flash" });
  console.log(`Session opened in ${Date.now() - t0}ms (warm)\n`);

  for await (const update of session.send("What is 42? Answer briefly.")) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }

  console.log();
  await session.close();
  await client.close();
}

main().catch(console.error);
