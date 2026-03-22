/**
 * @module errors
 *
 * Custom error types for the Gemini ACP library.
 *
 * All errors extend {@link GeminiError}, which itself extends the built-in
 * `Error` class. This makes it possible to catch every library-level error
 * with a single `instanceof GeminiError` check, or to narrow down to a
 * specific subclass for more targeted handling.
 *
 * @example
 * ```ts
 * import {
 *   GeminiError,
 *   GeminiRequestError,
 *   GeminiTimeoutError,
 * } from "gemini-acp";
 *
 * try {
 *   await session.send(message);
 * } catch (err) {
 *   if (err instanceof GeminiTimeoutError) {
 *     console.error("Request timed out:", err.message);
 *   } else if (err instanceof GeminiRequestError) {
 *     console.error(`Request failed (code ${err.code}):`, err.message);
 *   } else if (err instanceof GeminiError) {
 *     console.error("Gemini error:", err.message, err.metadata);
 *   }
 * }
 * ```
 */

/**
 * Base error class for all Gemini ACP errors.
 *
 * Every error thrown by the library is an instance of `GeminiError` (or one of
 * its subclasses), so you can use a single `instanceof GeminiError` check to
 * catch all library-specific errors.
 *
 * @example
 * ```ts
 * try {
 *   await session.send(message);
 * } catch (err) {
 *   if (err instanceof GeminiError) {
 *     console.error("Gemini error:", err.message);
 *     console.error("Metadata:", err.metadata);
 *     console.error("Cause:", err.cause);
 *   }
 * }
 * ```
 */
export class GeminiError extends Error {
  /**
   * Optional structured metadata providing additional context about the error.
   *
   * The contents are error-specific and may include details such as request
   * parameters, response fragments, or internal state at the time of failure.
   */
  public readonly metadata?: Record<string, unknown>;

  /**
   * @param message - A human-readable description of the error.
   * @param options - Optional configuration for the error.
   * @param options.cause - The underlying error that caused this one, if any.
   * @param options.metadata - Arbitrary key-value metadata for debugging.
   */
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, { cause: options?.cause });
    this.name = "GeminiError";
    this.metadata = options?.metadata;
    Object.setPrototypeOf(this, GeminiError.prototype);
  }
}

/**
 * Thrown when an error occurs while processing a Gemini response or
 * performing an internal operation that is not directly related to the
 * network request itself.
 *
 * Examples include failures during response parsing, data transformation,
 * or other post-request processing steps.
 *
 * @example
 * ```ts
 * try {
 *   await session.send(message);
 * } catch (err) {
 *   if (err instanceof GeminiProcessError) {
 *     console.error("Processing failed:", err.message);
 *   }
 * }
 * ```
 */
export class GeminiProcessError extends GeminiError {
  /**
   * @param message - A human-readable description of the processing error.
   * @param options - Optional configuration for the error.
   * @param options.cause - The underlying error that caused this one, if any.
   * @param options.metadata - Arbitrary key-value metadata for debugging.
   */
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiProcessError";
    Object.setPrototypeOf(this, GeminiProcessError.prototype);
  }
}

/**
 * Thrown when the Gemini API returns a response that violates the expected
 * protocol or message format.
 *
 * This typically indicates an unexpected response structure, an unsupported
 * protocol version, or a malformed message from the server.
 *
 * @example
 * ```ts
 * try {
 *   await session.send(message);
 * } catch (err) {
 *   if (err instanceof GeminiProtocolError) {
 *     console.error("Protocol violation:", err.message);
 *   }
 * }
 * ```
 */
export class GeminiProtocolError extends GeminiError {
  /**
   * @param message - A human-readable description of the protocol error.
   * @param options - Optional configuration for the error.
   * @param options.cause - The underlying error that caused this one, if any.
   * @param options.metadata - Arbitrary key-value metadata for debugging.
   */
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiProtocolError";
    Object.setPrototypeOf(this, GeminiProtocolError.prototype);
  }
}

/**
 * Thrown when the Gemini API responds with a non-success HTTP status code
 * or an application-level error code.
 *
 * The numeric {@link code} property contains the error code returned by the
 * API, which can be used for programmatic error handling (e.g., retrying on
 * 429 rate-limit responses).
 *
 * @example
 * ```ts
 * try {
 *   await session.send(message);
 * } catch (err) {
 *   if (err instanceof GeminiRequestError) {
 *     if (err.code === 429) {
 *       console.warn("Rate limited — retrying after backoff");
 *     } else {
 *       console.error(`Request error (code ${err.code}):`, err.message);
 *     }
 *   }
 * }
 * ```
 */
export class GeminiRequestError extends GeminiError {
  /** The numeric error code returned by the Gemini API. */
  public readonly code: number;

  /**
   * @param message - A human-readable description of the request error.
   * @param code - The numeric error code from the API response.
   * @param options - Optional configuration for the error.
   * @param options.cause - The underlying error that caused this one, if any.
   * @param options.metadata - Arbitrary key-value metadata for debugging.
   */
  constructor(message: string, code: number, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiRequestError";
    this.code = code;
    Object.setPrototypeOf(this, GeminiRequestError.prototype);
  }
}

/**
 * Thrown when a request to the Gemini API exceeds the configured timeout
 * duration without receiving a response.
 *
 * @example
 * ```ts
 * try {
 *   await session.send(message);
 * } catch (err) {
 *   if (err instanceof GeminiTimeoutError) {
 *     console.error("Request timed out:", err.message);
 *   }
 * }
 * ```
 */
export class GeminiTimeoutError extends GeminiError {
  /**
   * @param message - A human-readable description of the timeout.
   * @param options - Optional configuration for the error.
   * @param options.cause - The underlying error that caused this one, if any.
   * @param options.metadata - Arbitrary key-value metadata for debugging.
   */
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiTimeoutError";
    Object.setPrototypeOf(this, GeminiTimeoutError.prototype);
  }
}

/**
 * Thrown when an operation is attempted on a session that has already been
 * closed.
 *
 * Once a session is closed it cannot be reused; a new session must be
 * created instead.
 *
 * @example
 * ```ts
 * try {
 *   await session.send(message);
 * } catch (err) {
 *   if (err instanceof GeminiSessionClosedError) {
 *     console.error("Session is closed — open a new one");
 *   }
 * }
 * ```
 */
export class GeminiSessionClosedError extends GeminiError {
  /**
   * @param message - A human-readable description of the error.
   * @param options - Optional configuration for the error.
   * @param options.cause - The underlying error that caused this one, if any.
   * @param options.metadata - Arbitrary key-value metadata for debugging.
   */
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiSessionClosedError";
    Object.setPrototypeOf(this, GeminiSessionClosedError.prototype);
  }
}

/**
 * Thrown when a new request is made on a session that is already processing
 * another request.
 *
 * Each session supports only one in-flight request at a time. Wait for the
 * current request to complete before sending another, or open a second
 * session for concurrent work.
 *
 * @example
 * ```ts
 * try {
 *   await session.send(message);
 * } catch (err) {
 *   if (err instanceof GeminiSessionBusyError) {
 *     console.warn("Session busy — waiting before retry");
 *   }
 * }
 * ```
 */
export class GeminiSessionBusyError extends GeminiError {
  /**
   * @param message - A human-readable description of the error.
   * @param options - Optional configuration for the error.
   * @param options.cause - The underlying error that caused this one, if any.
   * @param options.metadata - Arbitrary key-value metadata for debugging.
   */
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, options);
    this.name = "GeminiSessionBusyError";
    Object.setPrototypeOf(this, GeminiSessionBusyError.prototype);
  }
}