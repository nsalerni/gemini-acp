import { readFileSync } from "node:fs";
import { type GeminiContentBlock } from "../types";

/**
 * Convert an image file to a Gemini content block
 * Supports PNG, JPEG, GIF, and WebP
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
