import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that adds X-Response-Time header to all responses.
 * Slow request warnings are handled by RequestLoggerMiddleware (threshold: 500ms).
 */
@Injectable()
export class ResponseTimeMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationNs = Number(process.hrtime.bigint() - start);
      const durationMs = Math.round(durationNs / 1_000_000);
      res.setHeader('X-Response-Time', `${durationMs}ms`);
    });

    next();
  }
}
