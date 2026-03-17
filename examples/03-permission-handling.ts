/**
 * Example: Handle permission requests in plan mode
 */

import { createGeminiClient } from "../src/index";

async function main() {
  const client = await createGeminiClient({
    cwd: process.cwd(),
    logger: {
      debug: (msg) => console.log("[DEBUG]", msg),
      info: (msg) => console.log("[INFO]", msg),
      warn: (msg) => console.warn("[WARN]", msg),
      error: (msg) => console.error("[ERROR]", msg),
    },
  });

  const session = await client.openSession({
    cwd: process.cwd(),
    mode: "plan", // Plan mode requires permission approval
    onPermissionRequest: async (request) => {
      console.log("\n🔒 Permission request received:");
      console.log(`  Session: ${request.sessionId}`);
      console.log("  Options:");

      for (const option of request.options) {
        console.log(`    - ${option.optionId}: ${option.kind}`);
      }

      // Auto-approve the first "allow" option
      const allowOption = request.options.find(
        (opt) => opt.kind === "allow_once" || opt.kind === "allow_always"
      );

      if (allowOption) {
        console.log(`  ✅ Approving: ${allowOption.optionId}`);
        return {
          outcome: {
            outcome: "selected",
            optionId: allowOption.optionId,
          },
        };
      }

      console.log("  ❌ No allow option found, cancelling");
      return {
        outcome: {
          outcome: "cancelled",
        },
      };
    },
  });

  console.log("📝 Session opened in plan mode");

  // Send a prompt
  await session.prompt([
    {
      type: "text",
      text: "Create a new file called 'test.txt' with content 'hello world'",
    },
  ]);

  // Stream updates
  for await (const update of session.updates()) {
    switch (update.sessionUpdate) {
      case "plan":
        console.log("\n📋 Plan:");
        for (const entry of update.entries) {
          console.log(`  [${entry.status}] ${entry.content}`);
        }
        break;

      case "agent_message_chunk":
        process.stdout.write(update.content?.text ?? "");
        break;

      case "tool_call":
        console.log(`\n🛠️  Calling: ${update.title}`);
        break;

      case "tool_call_update":
        if (update.status === "completed") {
          console.log(`✅ ${update.title} completed`);
        }
        break;
    }
  }

  console.log("\n\n✨ Done");

  await session.close();
  await client.close();
}

main().catch(console.error);
