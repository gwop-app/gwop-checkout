export class GwopCheckoutError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
    public readonly requestId?: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'GwopCheckoutError';
    Object.setPrototypeOf(this, GwopCheckoutError.prototype);
  }
}

export class AuthenticationError extends GwopCheckoutError {
  constructor(message = 'Invalid or missing API key', requestId?: string, raw?: unknown) {
    super(message, 'UNAUTHORIZED', 401, undefined, requestId, raw);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class InvalidRequestError extends GwopCheckoutError {
  constructor(message: string, code = 'INVALID_REQUEST', details?: Record<string, unknown>, requestId?: string, raw?: unknown) {
    super(message, code, 400, details, requestId, raw);
    this.name = 'InvalidRequestError';
    Object.setPrototypeOf(this, InvalidRequestError.prototype);
  }
}

export class NotFoundError extends GwopCheckoutError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', requestId?: string, raw?: unknown) {
    super(message, code, 404, undefined, requestId, raw);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class RateLimitError extends GwopCheckoutError {
  constructor(message = 'Too many requests', retryAfterSeconds?: number, requestId?: string, raw?: unknown) {
    super(
      message,
      'RATE_LIMITED',
      429,
      retryAfterSeconds !== undefined ? { retry_after_seconds: retryAfterSeconds } : undefined,
      requestId,
      raw,
    );
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}
