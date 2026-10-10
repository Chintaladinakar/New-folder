import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

/** An error whose message is safe to show the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message, ...err.details });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: err.issues[0]?.message ?? 'Invalid request',
      issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  // Errors from express.json(): malformed JSON, body too large, and so on.
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ message: status === 413 ? 'Request body is too large' : 'Malformed request' });
    return;
  }

  // Internal details are logged, never sent: they can contain SQL, bucket names or credentials.
  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  res.status(500).json({ message: 'Something went wrong on the server' });
};
