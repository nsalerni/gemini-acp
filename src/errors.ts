/**
 * Error types for the Gemini ACP library
 */

export class GeminiError extends Error {
  public readonly cause?: unknown;
  public readonly metadata?: Record<string, unknown>;

  constructor(message: string, cause?: unknown, metadata?: Record<string, unknown>) {
    super(message);
    this.name = "GeminiError";
    this.cause = cause;
    this.metadata = metadata;
    Object.setPrototypeOf(this, GeminiError.prototype);
  }
}

export class GeminiProcessError extends GeminiError {
  constructor(message: string, cause?: unknown, metadata?: Record<string, unknown>) {
    super(message, cause, metadata);
    this.name = "GeminiProcessError";
    Object.setPrototypeOf(this, GeminiProcessError.prototype);
  }
}

export class GeminiProtocolError extends GeminiError {
  constructor(message: string, cause?: unknown, metadata?: Record<string, unknown>) {
    super(message, cause, metadata);
    this.name = "GeminiProtocolError";
    Object.setPrototypeOf(this, GeminiProtocolError.prototype);
  }
}

export class GeminiRequestError extends GeminiError {
  constructor(message: string, cause?: unknown, metadata?: Record<string, unknown>) {
    super(message, cause, metadata);
    this.name = "GeminiRequestError";
    Object.setPrototypeOf(this, GeminiRequestError.prototype);
  }
}

export class GeminiTimeoutError extends GeminiError {
  constructor(message: string, cause?: unknown, metadata?: Record<string, unknown>) {
    super(message, cause, metadata);
    this.name = "GeminiTimeoutError";
    Object.setPrototypeOf(this, GeminiTimeoutError.prototype);
  }
}

export class GeminiSessionNotFoundError extends GeminiError {
  constructor(message: string, cause?: unknown, metadata?: Record<string, unknown>) {
    super(message, cause, metadata);
    this.name = "GeminiSessionNotFoundError";
    Object.setPrototypeOf(this, GeminiSessionNotFoundError.prototype);
  }
}

export class GeminiPermissionError extends GeminiError {
  constructor(message: string, cause?: unknown, metadata?: Record<string, unknown>) {
    super(message, cause, metadata);
    this.name = "GeminiPermissionError";
    Object.setPrototypeOf(this, GeminiPermissionError.prototype);
  }
}
