/**
 * Error types for the Gemini ACP library
 */

export class GeminiError extends Error {
  public readonly metadata?: Record<string, unknown>;

  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, { cause: options?.cause });
    this.name = "GeminiError";
    this.metadata = options?.metadata;
    Object.setPrototypeOf(this, GeminiError.prototype);
  }
}

export class GeminiProcessError extends GeminiError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiProcessError";
    Object.setPrototypeOf(this, GeminiProcessError.prototype);
  }
}

export class GeminiProtocolError extends GeminiError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiProtocolError";
    Object.setPrototypeOf(this, GeminiProtocolError.prototype);
  }
}

export class GeminiRequestError extends GeminiError {
  public readonly code: number;

  constructor(message: string, code: number, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiRequestError";
    this.code = code;
    Object.setPrototypeOf(this, GeminiRequestError.prototype);
  }
}

export class GeminiTimeoutError extends GeminiError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiTimeoutError";
    Object.setPrototypeOf(this, GeminiTimeoutError.prototype);
  }
}

export class GeminiSessionClosedError extends GeminiError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiSessionClosedError";
    Object.setPrototypeOf(this, GeminiSessionClosedError.prototype);
  }
}

export class GeminiSessionBusyError extends GeminiError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiSessionBusyError";
    Object.setPrototypeOf(this, GeminiSessionBusyError.prototype);
  }
}
