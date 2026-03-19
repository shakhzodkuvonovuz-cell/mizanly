import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware — logs slow queries (>500ms) and error rates.
 * Lightweight alternative to APM tools.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RequestLogger');
  private requestCount = 0;
  private errorCount = 0;
  private slowCount = 0;
  private readonly SLOW_THRESHOLD_MS = 500;

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const method = req.method;
    const url = req.originalUrl || req.url;

    this.requestCount++;

    // Listen for response finish
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;

      // Track errors
      if (status >= 500) {
        this.errorCount++;
        this.logger.error(`${method} ${url} → ${status} (${duration}ms)`);
      } else if (status >= 400) {
        // Log 4xx at warn level only for non-auth endpoints
        if (!url.includes('/auth/') && status !== 401 && status !== 429) {
          this.logger.warn(`${method} ${url} → ${status} (${duration}ms)`);
        }
      }

      // Log slow requests
      if (duration > this.SLOW_THRESHOLD_MS) {
        this.slowCount++;
        this.logger.warn(`SLOW: ${method} ${url} → ${status} (${duration}ms)`);
      }
    });

    next();
  }

  /** Get aggregated stats for the metrics endpoint */
  getStats() {
    return {
      totalRequests: this.requestCount,
      errorCount: this.errorCount,
      slowRequests: this.slowCount,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount * 100).toFixed(2) + '%' : '0%',
    };
  }
}
