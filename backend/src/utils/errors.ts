/**
 * ApeAI — Typed HTTP errors.
 * Throw these from services; the global error handler maps them to status codes.
 */

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = 'BadRequestError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

export class UpstreamError extends HttpError {
  constructor(message: string) {
    super(502, message);
    this.name = 'UpstreamError';
  }
}
