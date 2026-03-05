import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
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

      response.status(status).json({
        success: false,
        statusCode: status,
        error: HttpStatus[status] ?? 'Error',
        message: error['message'] ?? exception.message,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
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
