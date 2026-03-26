import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { sanitizeText } from '../utils/sanitize';

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    // Sanitize both @Body and @Query params
    if ((metadata.type !== 'body' && metadata.type !== 'query') || typeof value !== 'object' || value === null) {
      return value;
    }
    return this.sanitizeObject(value as Record<string, unknown>);
  }

  private isPlainObject(val: unknown): val is Record<string, unknown> {
    return typeof val === 'object' && val !== null && !Array.isArray(val) && !(val instanceof Date);
  }

  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') {
        result[key] = sanitizeText(val);
      } else if (Array.isArray(val)) {
        result[key] = val.map(item => {
          if (typeof item === 'string') return sanitizeText(item);
          if (this.isPlainObject(item)) return this.sanitizeObject(item);
          return item;
        });
      } else if (this.isPlainObject(val)) {
        // Recurse into nested plain objects
        result[key] = this.sanitizeObject(val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }
}
