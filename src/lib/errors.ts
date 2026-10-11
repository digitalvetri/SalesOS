// Typed app errors — the only error class that reaches the UI boundary.
// UI maps `code` to a translated string; unknown errors show a reference id.
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "DEACTIVATED"
  | "INVALID_CREDENTIALS"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly meta: Record<string, unknown> | undefined;
  override readonly cause: unknown;

  constructor(
    code: AppErrorCode,
    userMessage: string,
    meta?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(`${code}: ${userMessage}`);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.meta = meta;
    this.cause = cause;
  }

  toClient(): { code: AppErrorCode; message: string; meta?: Record<string, unknown> } {
    return { code: this.code, message: this.userMessage, meta: this.meta };
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

// Status code mapping for route handlers (Server Actions use the typed envelope).
export function appErrorStatus(code: AppErrorCode): number {
  switch (code) {
    case "UNAUTHENTICATED":
    case "INVALID_CREDENTIALS":
      return 401;
    case "FORBIDDEN":
    case "DEACTIVATED":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "VALIDATION":
      return 422;
    case "RATE_LIMITED":
      return 429;
    default:
      return 500;
  }
}
