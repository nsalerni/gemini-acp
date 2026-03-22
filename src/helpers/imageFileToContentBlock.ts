import { readFileSync } from "node:fs";
import { type GeminiContentBlock } from "../types.js";

/**
 * Read an image file from disk and convert it to a base64-encoded
 * {@link GeminiContentBlock} suitable for sending in a Gemini session message.
 *
 * The MIME type is inferred from the file extension. Supported formats:
 *
 * | Extension       | MIME type      |
 * | --------------- | -------------- |
 * | `.png`          | `image/png`    |
 * | `.jpg`, `.jpeg` | `image/jpeg`   |
 * | `.gif`          | `image/gif`    |
 * | `.webp`         | `image/webp`   |
 *
 * Files with an unrecognized extension default to `image/jpeg`.
 *
 * @param filePath - Absolute or relative path to the image file on disk.
 * @returns A promise that resolves to a {@link GeminiContentBlock} with
 *   `type: "image"`, the inferred `mimeType`, and the file contents as a
 *   base64-encoded `data` string.
 * @throws {Error} If the file does not exist or cannot be read (propagated from
 *   {@link readFileSync}).
 *
 * @example
 * ```ts
 * const imageBlock = await imageFileToContentBlock("./screenshot.png");
 * const result = await collectTurn(
 *   session.send("Describe this image", { contentBlocks: [imageBlock] }),
 * );
 * ```
 */
export async function imageFileToContentBlock(
  filePath: string
): Promise<GeminiContentBlock> {
  const data = readFileSync(filePath).toString("base64");

  // Infer MIME type from file extension
  const ext = filePath.toLowerCase().split(".").pop();
  let mimeType = "image/jpeg";

  switch (ext) {
    case "png":
      mimeType = "image/png";
      break;
    case "gif":
      mimeType = "image/gif";
      break;
    case "webp":
      mimeType = "image/webp";
      break;
    case "jpg":
    case "jpeg":
      mimeType = "image/jpeg";
      break;
  }

  return {
    type: "image",
    mimeType,
    data,
  };
}
