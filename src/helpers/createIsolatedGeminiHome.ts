import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
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
 * Create an isolated Gemini CLI home directory by mirroring essential
 * authentication and configuration files from the user's real `~/.gemini`
 * directory into a sandboxed location.
 *
 * This allows Gemini CLI to run in an isolated environment without modifying
 * the user's primary configuration. The following files are copied (when they
 * exist) from `~/.gemini` into `<stateDir>/.gemini`:
 *
 * - `oauth_creds.json` — OAuth credentials
 * - `google_account_id` — active Google account identifier
 * - `google_accounts.json` — stored Google accounts
 * - `installation_id` — unique installation identifier
 * - `trustedFolders.json` — list of trusted workspace folders
 * - `mcp-oauth-tokens.json` — MCP OAuth tokens
 * - `settings.json.orig` — original settings backup
 *
 * Additionally, `settings.json` is copied and patched so that
 * `context.fileName` points to a Gemini ACP–specific context file.
 *
 * The returned `env` object includes `GEMINI_CLI_HOME` set to `stateDir` and
 * `GEMINI_SYSTEM_MD` set to `"false"`, and should be passed as the
 * environment when spawning Gemini CLI processes.
 *
 * @param input - Configuration object.
 * @param input.stateDir - Absolute path to the directory that will serve as the
 *   isolated Gemini home root. A `.gemini` subdirectory is created inside it.
 * @returns A promise that resolves to an object containing `env`, a
 *   `NodeJS.ProcessEnv` suitable for spawning Gemini CLI in the isolated home.
 *
 * @example
 * ```ts
 * const { env } = await createIsolatedGeminiHome({
 *   stateDir: "/tmp/my-app-gemini-home",
 * });
 * // Use `env` when spawning Gemini CLI processes:
 * spawn("gemini", ["..."], { env });
 * ```
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
        mkdirSync(dirname(destPath), { recursive: true });
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
