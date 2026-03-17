/**
 * Internal utility functions
 */

export function toMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return fallback;
}

export function trimToUndefined(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function readSessionId(value: unknown): string | undefined {
  return trimToUndefined(asString(asObject(value)?.sessionId));
}

export function readSessionModelId(value: unknown): string | undefined {
  const models = asObject(asObject(value)?.models);
  return trimToUndefined(asString(models?.currentModelId));
}

export function nowIso(): string {
  return new Date().toISOString();
}
