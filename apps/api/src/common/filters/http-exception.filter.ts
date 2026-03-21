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

      if (process.env.NODE_ENV === 'production') {
        // In production, return generic message for server errors
        response.status(status).json({
          success: false,
          statusCode: status,
          error: HttpStatus[status] ?? 'Error',
          message: status >= 500 ? 'Internal server error' : error['message'] ?? exception.message,
          path: request.url,
          timestamp: new Date().toISOString(),
        });
      } else {
        // In development, log stack to server but don't leak in API response
        this.logger.error(`[${status}] ${error['message'] ?? exception.message}`, exception.stack);
        response.status(status).json({
          success: false,
          statusCode: status,
          error: HttpStatus[status] ?? 'Error',
          message: error['message'] ?? exception.message,
          path: request.url,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));

      // Capture unhandled exceptions in Sentry
      if (process.env.SENTRY_DSN && exception instanceof Error) {
        Sentry.captureException(exception);
      }
      if (process.env.NODE_ENV === 'production') {
        response.status(500).json({
          success: false,
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred',
          path: request.url,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Stack already logged above — never include in API response
        response.status(500).json({
          success: false,
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred',
          path: request.url,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}
