import { createParamDecorator, ExecutionContext, Logger } from '@nestjs/common';

const currentUserLogger = new Logger('CurrentUser');

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // Warn when userId is undefined on a guarded route — indicates auth guard
    // did not attach user, which means either the guard is missing or the
    // guard failed silently. This helps catch wiring bugs early.
    if (!user && data) {
      const handler = ctx.getHandler();
      const className = ctx.getClass()?.name || 'Unknown';
      const methodName = handler?.name || 'unknown';
      currentUserLogger.warn(
        `@CurrentUser('${data}') returned undefined on ${className}.${methodName} — ` +
        'ensure ClerkAuthGuard is applied to this route',
      );
    }

    return data ? user?.[data] : user;
  },
);
