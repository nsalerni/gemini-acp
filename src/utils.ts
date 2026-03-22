/**
 * Internal utility functions shared across the ACP library.
 *
 * These helpers handle common tasks such as safe type narrowing,
 * message extraction, and timestamp generation.
 *
 * @module utils
 * @internal
 */

/**
 * Extract a human-readable message from an unknown error value.
 *
 * If `cause` is an `Error` instance with a non-empty `message`, that message
 * is returned. Otherwise the provided `fallback` string is returned.
 *
 * @internal
 * @param cause - The caught error value (may be anything).
 * @param fallback - The fallback message to use when `cause` is not a
 *   recognisable `Error` or has an empty message.
 * @returns A non-empty error message string.
 */
export function toMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return fallback;
}

/**
 * Trim a string and return `undefined` if the result is empty or the input
 * is `undefined`.
 *
 * Useful for normalising optional string fields so that blank / whitespace-only
 * values are treated the same as missing values.
 *
 * @internal
 * @param value - The string to trim, or `undefined`.
 * @returns The trimmed string, or `undefined` if the trimmed result is empty.
 */
export function trimToUndefined(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Narrow an unknown value to a plain object record.
 *
 * Returns `undefined` when `value` is falsy or not of type `"object"`.
 *
 * @internal
 * @param value - The value to check.
 * @returns The value cast to `Record<string, unknown>`, or `undefined`.
 */
export function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

/**
 * Narrow an unknown value to a `string`.
 *
 * Returns `undefined` when `value` is not a string.
 *
 * @internal
 * @param value - The value to check.
 * @returns The value as a `string`, or `undefined`.
 */
export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Extract and validate a `sessionId` from an unknown payload.
 *
 * Expects `value` to be an object with a `sessionId` string property.
 * The extracted ID is trimmed; blank or missing values yield `undefined`.
 *
 * @internal
 * @param value - The raw payload (typically a JSON-RPC result).
 * @returns The trimmed session ID, or `undefined` if not present / blank.
 */
export function readSessionId(value: unknown): string | undefined {
  return trimToUndefined(asString(asObject(value)?.sessionId));
}

/**
 * Extract the current model ID from an unknown payload.
 *
 * Expects `value` to be an object containing a `models` sub-object with a
 * `currentModelId` string property. The extracted ID is trimmed; blank or
 * missing values yield `undefined`.
 *
 * @internal
 * @param value - The raw payload (typically a JSON-RPC result).
 * @returns The trimmed model ID, or `undefined` if not present / blank.
 */
export function readSessionModelId(value: unknown): string | undefined {
  const models = asObject(asObject(value)?.models);
  return trimToUndefined(asString(models?.currentModelId));
}

/**
 * Return the current date-time as an ISO 8601 string (e.g. `"2025-01-15T12:34:56.789Z"`).
 *
 * @internal
 * @returns An ISO 8601 timestamp string.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
