/**
 * Example: Using warm start for fast first prompts
 *
 * When warmStart is enabled, the client starts a background session
 * on initialization. This means the first session you open is already
 * "warm" and responds much faster than a cold start.
 */

import { createGeminiClient } from "../src/index";

async function main() {
  console.log("📍 Creating client with warm start enabled...");

  // Create client with warm start enabled
  // This will start a background session immediately
  const client = await createGeminiClient({
    cwd: process.cwd(),
    warmStart: true,
    warmStartTimeoutMs: 30_000,
    logger: {
      info: (msg) => console.log("[INFO]", msg),
      debug: (msg) => console.log("[DEBUG]", msg),
    },
  });

  // Give the warm session a moment to start in the background
  console.log("⏳ Waiting for warm session to initialize...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("\n📝 Opening first session (will use warm session)...");
  const startTime = Date.now();

  const session1 = await client.openSession({
    cwd: process.cwd(),
    model: "gemini-3-flash-preview",
    mode: "yolo",
  });

  const warmTime = Date.now() - startTime;
  console.log(`✅ First session opened in ${warmTime}ms (from warm session)\n`);

  // Send a prompt
  await session1.prompt([
    {
      type: "text",
      text: "What is the significance of the number 42? Answer briefly.",
    },
  ]);

  for await (const update of session1.updates()) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }

  await session1.close();
  console.log("\n");

  // Open a second session - if warm start worked, another warm session
  // should be ready in the background
  console.log("📝 Opening second session...");
  const startTime2 = Date.now();

  const session2 = await client.openSession({
    cwd: process.cwd(),
    model: "gemini-3-flash-preview",
    mode: "yolo",
  });

  const openTime = Date.now() - startTime2;
  console.log(`✅ Second session opened in ${openTime}ms\n`);

  // Send another prompt
  await session2.prompt([
    {
      type: "text",
      text: "What is the meaning of life? Answer briefly.",
    },
  ]);

  for await (const update of session2.updates()) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }

  console.log("\n");

  // Compare timing
  console.log("⏱️  Timing Comparison:");
  console.log(`   First session:  ${warmTime}ms (warm)`);
  console.log(`   Second session: ${openTime}ms (if warm session ready)`);

  await session2.close();
  await client.close();

  console.log("\n✨ Done");
}

main().catch(console.error);
