export type AppErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public code?: string,
    public details?: AppErrorDetails,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
