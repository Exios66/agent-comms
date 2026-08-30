export type HubErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "VALIDATION";

export class HubError extends Error {
  readonly code: HubErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: HubErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HubError";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function isHubError(error: unknown): error is HubError {
  return error instanceof HubError;
}

export function hubStatus(code: HubErrorCode): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "RATE_LIMITED":
      return 429;
    case "VALIDATION":
      return 400;
    default:
      return 500;
  }
}
