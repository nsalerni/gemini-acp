/**
 * Example: Send a prompt with an image attachment
 */

import { createGeminiClient } from "../src/index.js";
import { imageFileToContentBlock } from "../src/helpers/imageFileToContentBlock.js";

async function main() {
  const client = await createGeminiClient({
    cwd: process.cwd(),
  });

  const session = await client.openSession({
    cwd: process.cwd(),
    model: "gemini-3-flash-preview",
    mode: "yolo",
  });

  // Load an image from disk
  const imageBlock = await imageFileToContentBlock("./example.png");

  // Send prompt with image
  await session.prompt([
    {
      type: "text",
      text: "Analyze this image and describe what you see",
    },
    imageBlock,
  ]);

  // Stream response
  for await (const update of session.updates()) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }

  await session.close();
  await client.close();
}

main().catch(console.error);
