export const INTERNAL_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * An error whose message is safe to show a user. `name` is set from the code
 * rather than the class because AppSync reports it as `errorType` and the
 * production bundle is minified, which would mangle class names.
 */
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Please log in again.") {
    super("UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to that.") {
    super("FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super("NOT_FOUND", message);
  }
}

export class ValidationError extends AppError {
  constructor(message = "That request isn't valid.") {
    super("VALIDATION", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "That changed while you were working. Please try again.") {
    super("CONFLICT", message);
  }
}

/** A third-party service (TMDB, RapidAPI) failed in a way the user can retry. */
export class UpstreamError extends AppError {
  constructor(message = "Movie data is unavailable right now. Please try again.") {
    super("UPSTREAM", message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many attempts. Please wait a bit and try again.") {
    super("RATE_LIMITED", message);
  }
}

export class InvalidRoomCodeError extends ValidationError {
  constructor() {
    super("Invalid room code");
  }
}

/** Anything that isn't an AppError may carry internals, so it never reaches the client as-is. */
export function toClientError(error: unknown): AppError {
  return error instanceof AppError ? error : new AppError("INTERNAL", INTERNAL_ERROR_MESSAGE);
}
