import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const SLOW_THRESHOLD_MS = 200;

/**
 * Middleware that measures and logs request duration.
 * Adds X-Response-Time header to all responses.
 * Warns for slow requests (> 200ms).
 */
@Injectable()
export class ResponseTimeMiddleware implements NestMiddleware {
  private readonly logger = new Logger('ResponseTime');

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationNs = Number(process.hrtime.bigint() - start);
      const durationMs = Math.round(durationNs / 1_000_000);

      res.setHeader('X-Response-Time', `${durationMs}ms`);

      if (durationMs > SLOW_THRESHOLD_MS) {
        this.logger.warn(
          `Slow request: ${req.method} ${req.originalUrl} took ${durationMs}ms`,
        );
      }
    });

    next();
  }
}
