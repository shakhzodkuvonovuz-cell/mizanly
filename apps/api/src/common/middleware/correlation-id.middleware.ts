import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Extend Express Request type to include id property for pino-http
interface RequestWithId extends Request {
  id?: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const incoming = req.headers['x-correlation-id'];
    let correlationId: string;

    if (Array.isArray(incoming)) {
      correlationId = incoming[0] || randomUUID();
    } else {
      correlationId = incoming || randomUUID();
    }

    req.headers['x-correlation-id'] = correlationId;
    req.id = correlationId; // For pino-http integration
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}