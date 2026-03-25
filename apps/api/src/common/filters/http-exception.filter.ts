import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // Skip HTTP handling for WebSocket context — let WS handle its own errors
    if (host.getType() === 'ws') {
      this.logger.error('WebSocket exception', exception instanceof Error ? exception.stack : String(exception));
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const error =
        typeof exceptionResponse === 'string'
          ? { message: exceptionResponse }
          : (exceptionResponse as Record<string, unknown>);

      // Capture 5xx errors in Sentry
      if (process.env.SENTRY_DSN && status >= 500 && exception instanceof Error) {
        Sentry.captureException(exception);
      }

      // Finding #370: Consistent error codes across API
      const errorCode = this.deriveErrorCode(status, error['message'] as string | undefined);

      if (process.env.NODE_ENV === 'production') {
        response.status(status).json({
          success: false,
          statusCode: status,
          errorCode,
          error: HttpStatus[status] ?? 'Error',
          message: status >= 500 ? 'Internal server error' : error['message'] ?? exception.message,
          path: request.url,
          timestamp: new Date().toISOString(),
        });
      } else {
        this.logger.error(`[${status}] ${error['message'] ?? exception.message}`, exception.stack);
        response.status(status).json({
          success: false,
          statusCode: status,
          errorCode,
          error: HttpStatus[status] ?? 'Error',
          message: error['message'] ?? exception.message,
          path: request.url,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
      const errorCode = 'INTERNAL_ERROR';

      // Capture unhandled exceptions in Sentry
      if (process.env.SENTRY_DSN && exception instanceof Error) {
        Sentry.captureException(exception);
      }
      if (process.env.NODE_ENV === 'production') {
        response.status(500).json({
          success: false,
          statusCode: 500,
          errorCode,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred',
          path: request.url,
          timestamp: new Date().toISOString(),
        });
      } else {
        response.status(500).json({
          success: false,
          statusCode: 500,
          errorCode,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred',
          path: request.url,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Derive a machine-readable error code from HTTP status and message.
   */
  private deriveErrorCode(status: number, message?: string): string {
    const msg = (message || '').toLowerCase();
    if (status === 400) {
      if (msg.includes('duplicate')) return 'DUPLICATE_CONTENT';
      if (msg.includes('flagged') || msg.includes('violation')) return 'CONTENT_FLAGGED';
      if (msg.includes('validation')) return 'VALIDATION_ERROR';
      return 'BAD_REQUEST';
    }
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'INTERNAL_ERROR';
    return `HTTP_${status}`;
  }
}
