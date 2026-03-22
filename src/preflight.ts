/**
 * Preflight diagnostics for the Gemini CLI.
 */

import { execFile } from "node:child_process";

export interface PreflightResult {
  /** `true` when the CLI is found **and** supports ACP. */
  readonly ok: boolean;
  /** Resolved path (or name) of the Gemini CLI binary that was checked. */
  readonly binaryPath: string;
  /** Whether the binary was found on the system. */
  readonly binaryFound: boolean;
  /** Semver-ish version string parsed from `gemini --version`, if available. */
  readonly version?: string;
  /** Whether the detected version meets the minimum ACP requirement (≥ 0.30). */
  readonly acpSupported: boolean;
  /** Human-readable messages describing any problems that were detected. */
  readonly diagnostics: string[];
}

export interface PreflightOptions {
  /**
   * Path or command name of the Gemini CLI binary.
   * @defaultValue `"gemini"`
   */
  binaryPath?: string;
  /**
   * Maximum time in milliseconds to wait for the CLI to respond.
   * @defaultValue `10_000`
   */
  timeoutMs?: number;
}

/**
 * Check if the Gemini CLI is installed, accessible, and supports ACP.
 * Use this to provide actionable error messages before creating a client.
 *
 * @param options - Optional overrides for the binary path and timeout.
 * @returns A {@link PreflightResult} summarising CLI availability and ACP support.
 *
 * @example
 * ```ts
 * const check = await preflightGemini();
 * if (!check.ok) {
 *   console.error("Gemini CLI issues:", check.diagnostics);
 * }
 * ```
 */
export async function preflightGemini(options?: PreflightOptions): Promise<PreflightResult> {
  const binaryPath = options?.binaryPath ?? "gemini";
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const diagnostics: string[] = [];

  let version: string | undefined;
  let binaryFound = false;

  try {
    const stdout = await execWithTimeout(binaryPath, ["--version"], timeoutMs);
    binaryFound = true;

    const match = stdout.match(/(\d+\.\d+(?:\.\d+)?)/);
    if (match) {
      version = match[1];
    } else {
      diagnostics.push(`Could not parse version from output: ${stdout.trim().slice(0, 100)}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT") || message.includes("not found")) {
      diagnostics.push(
        `Gemini CLI not found at "${binaryPath}". ` +
        "Install it from https://ai.google.dev/gemini-cli or pass a custom binaryPath."
      );
    } else if (message.includes("timed out")) {
      binaryFound = true;
      diagnostics.push(`Gemini CLI at "${binaryPath}" timed out after ${timeoutMs}ms.`);
    } else {
      diagnostics.push(`Failed to run "${binaryPath} --version": ${message}`);
    }
  }

  let acpSupported = false;
  if (version) {
    const parts = version.split(".").map(Number);
    const major = parts[0] ?? 0;
    const minor = parts[1] ?? 0;
    acpSupported = major >= 1 || (major === 0 && minor >= 30);
    if (!acpSupported) {
      diagnostics.push(
        `Gemini CLI version ${version} does not support ACP (requires 0.30+). ` +
        "Update with: npm update -g @google/gemini-cli"
      );
    }
  }

  const ok = binaryFound && acpSupported;

  return {
    ok,
    binaryPath,
    binaryFound,
    version,
    acpSupported,
    diagnostics,
  };
}

/**
 * Run a command and return its stdout, rejecting if it exceeds the timeout.
 *
 * @internal
 * @param command - Binary to execute.
 * @param args - Arguments passed to the binary.
 * @param timeoutMs - Maximum execution time in milliseconds.
 */
function execWithTimeout(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}
