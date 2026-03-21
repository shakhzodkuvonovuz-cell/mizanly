import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => {
        // If data already has a `data` envelope (e.g. paginated responses), pass through
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          return { success: true, ...data, timestamp: new Date().toISOString() };
        }
        // Normalize null/undefined to empty object so clients always get { data: {} }
        return {
          success: true,
          data: data ?? {},
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
