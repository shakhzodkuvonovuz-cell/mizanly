import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

/**
 * Phase 3, Workstream 4: Request metrics interceptor.
 *
 * Logs request latency for every API call. In production, these metrics
 * feed into Sentry performance monitoring and can be exported to
 * Prometheus/Grafana via the /health/metrics endpoint.
 *
 * Thresholds:
 * - < 200ms: normal (debug log)
 * - 200-1000ms: slow (warn log)
 * - > 1000ms: very slow (error log)
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Metrics');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const url = req.url;
    const start = Date.now();

    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const status = response?.statusCode ?? 200;
          this.logMetric(method, url, duration, status);
        },
        error: (err) => {
          const duration = Date.now() - start;
          const status = err?.status || 500;
          this.logMetric(method, url, duration, status);
        },
      }),
    );
  }

  private logMetric(method: string, url: string, duration: number, status: number) {
    // Strip query params for cleaner metrics grouping
    const path = url.split('?')[0];

    if (duration > 1000) {
      this.logger.error(`SLOW ${method} ${path} ${status} ${duration}ms`);
    } else if (duration > 200) {
      this.logger.warn(`${method} ${path} ${status} ${duration}ms`);
    } else {
      this.logger.debug(`${method} ${path} ${status} ${duration}ms`);
    }
  }
}
