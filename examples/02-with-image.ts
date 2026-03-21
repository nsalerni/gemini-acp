/**
 * Example: Send a prompt with an image attachment
 */

import { createGeminiClient } from "../src/index.js";
import { imageFileToContentBlock } from "../src/helpers/imageFileToContentBlock.js";

async function main() {
  const client = await createGeminiClient();
  const session = await client.openSession({ model: "gemini-3.1-flash" });

  const imageBlock = await imageFileToContentBlock("./example.png");

  for await (const update of session.send([
    { type: "text", text: "Describe what you see in this image" },
    imageBlock,
  ])) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }

  console.log();
  await session.close();
  await client.close();
}

main().catch(console.error);
