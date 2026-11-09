/**
 * ApeAI — Global Error Handler Middleware
 *
 * Catches all errors passed to next(err) and returns consistent
 * JSON error responses.
 */

import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/errors';

const CONNECTION_ERROR_TERMS = [
  'Name or service not known',
  'Connection refused',
  'ConnectError',
  'ECONNREFUSED',
  'ENOTFOUND',
  'Service Unavailable',
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ detail: err.message });
    return;
  }

  // multer file-size errors etc.
  if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ detail: 'Uploaded file is too large' });
    return;
  }

  const message = err?.message ?? String(err);

  if (CONNECTION_ERROR_TERMS.some((term) => message.includes(term))) {
    console.error('Database unavailable:', message);
    res.status(503).json({ detail: 'Database unavailable. Please try again shortly.' });
    return;
  }

  console.error('Unhandled exception:', err);
  res.status(500).json({ detail: `Internal server error: ${message}` });
}
