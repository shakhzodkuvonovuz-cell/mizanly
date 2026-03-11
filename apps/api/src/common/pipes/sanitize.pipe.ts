import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { sanitizeText } from '../utils/sanitize';

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body' || typeof value !== 'object' || value === null) {
      return value;
    }
    return this.sanitizeObject(value as Record<string, unknown>);
  }

  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') {
        result[key] = sanitizeText(val);
      } else if (Array.isArray(val)) {
        result[key] = val.map(item => typeof item === 'string' ? sanitizeText(item) : item);
      } else {
        result[key] = val;
      }
    }
    return result;
  }
}
