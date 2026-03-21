/**
 * Preflight diagnostics for the Gemini CLI.
 */

import { execFile } from "node:child_process";

export interface PreflightResult {
  readonly ok: boolean;
  readonly binaryPath: string;
  readonly binaryFound: boolean;
  readonly version?: string;
  readonly acpSupported: boolean;
  readonly diagnostics: string[];
}

export interface PreflightOptions {
  binaryPath?: string;
  timeoutMs?: number;
}

/**
 * Check if the Gemini CLI is installed, accessible, and supports ACP.
 * Use this to provide actionable error messages before creating a client.
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

function execWithTimeout(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
    child.unref?.();
  });
}
