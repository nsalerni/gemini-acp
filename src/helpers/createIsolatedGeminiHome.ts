import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const GEMINI_GLOBAL_DIRNAME = ".gemini";
const GEMINI_HOME_MIRROR_FILES = [
  "oauth_creds.json",
  "google_account_id",
  "google_accounts.json",
  "installation_id",
  "trustedFolders.json",
  "mcp-oauth-tokens.json",
  "settings.json.orig",
] as const;

/**
 * Create an isolated Gemini home directory
 * This is useful for running Gemini in a sandbox without interfering with user's main config
 */
export async function createIsolatedGeminiHome(input: {
  stateDir: string;
}): Promise<{
  env: NodeJS.ProcessEnv;
}> {
  const appHomeRoot = input.stateDir;
  const appGeminiDir = join(appHomeRoot, GEMINI_GLOBAL_DIRNAME);
  const realGeminiDir = join(homedir(), GEMINI_GLOBAL_DIRNAME);

  // Create directories
  mkdirSync(appGeminiDir, { recursive: true });

  // Mirror auth/config files
  for (const fileName of GEMINI_HOME_MIRROR_FILES) {
    const sourcePath = join(realGeminiDir, fileName);
    const destPath = join(appGeminiDir, fileName);

    if (existsSync(sourcePath)) {
      try {
        mkdirSync(require("path").dirname(destPath), { recursive: true });
        copyFileSync(sourcePath, destPath);
      } catch {
        // Best effort; ignore if mirroring fails
      }
    }
  }

  // Mirror and patch settings.json
  const realSettings = readJsonObject(join(realGeminiDir, "settings.json")) ?? {};
  const realContext = (realSettings.context as Record<string, unknown>) ?? {};
  const appSettings = {
    ...realSettings,
    context: {
      ...realContext,
      fileName: "__GEMINI_ACP_CONTEXT__.md",
    },
  };

  writeFileSync(join(appGeminiDir, "settings.json"), JSON.stringify(appSettings, null, 2) + "\n");

  return {
    env: {
      ...process.env,
      GEMINI_CLI_HOME: appHomeRoot,
      GEMINI_SYSTEM_MD: "false",
    },
  };
}

function readJsonObject(filePath: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
