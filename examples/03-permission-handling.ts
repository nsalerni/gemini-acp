/**
 * Example: Handle permission requests in plan mode
 */

import { createGeminiClient } from "../src/index.js";

async function main() {
  const client = await createGeminiClient();

  const session = await client.openSession({
    model: "gemini-3.1-flash",
    mode: "plan",
    onPermissionRequest: async (request) => {
      console.log(`\n🔒 Permission request for session ${request.sessionId}`);

      const allowOption = request.options.find(
        (opt) => opt.kind === "allow_once" || opt.kind === "allow_always",
      );

      if (allowOption) {
        console.log(`  ✅ Approving: ${allowOption.optionId}`);
        return { outcome: { outcome: "selected", optionId: allowOption.optionId } };
      }

      return { outcome: { outcome: "cancelled" } };
    },
  });

  for await (const update of session.send("What is 2 + 2? Answer briefly.")) {
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
        console.log(`\n🛠️  Tool: ${update.title}`);
        break;
    }
  }

  console.log();
  await session.close();
  await client.close();
}

main().catch(console.error);
