import { MetricsInterceptor } from './metrics.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('MetricsInterceptor', () => {
  let interceptor: MetricsInterceptor;

  const mockRequest = { method: 'GET', url: '/api/v1/posts?cursor=abc' };
  const mockResponse = { statusCode: 200 };

  const createContext = (req = mockRequest, res = mockResponse): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    }) as any;

  const createCallHandler = (result: unknown = { ok: true }): CallHandler =>
    ({ handle: () => of(result) }) as any;

  const createErrorCallHandler = (err: Error & { status?: number }): CallHandler =>
    ({ handle: () => throwError(() => err) }) as any;

  beforeEach(() => {
    interceptor = new MetricsInterceptor();
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000) // start
      .mockReturnValueOnce(1050); // in tap
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should log debug for fast requests (<200ms)', (done) => {
    const debugSpy = jest.spyOn((interceptor as any).logger, 'debug').mockImplementation();

    const ctx = createContext();
    const next = createCallHandler();

    interceptor.intercept(ctx, next).subscribe({
      next: () => {
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('GET /api/v1/posts'));
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('200'));
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('50ms'));
        done();
      },
    });
  });

  it('should log warn for slow requests (200-1000ms)', (done) => {
    jest.restoreAllMocks();
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1500); // 500ms

    const warnSpy = jest.spyOn((interceptor as any).logger, 'warn').mockImplementation();

    const ctx = createContext();
    const next = createCallHandler();

    interceptor.intercept(ctx, next).subscribe({
      next: () => {
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('500ms'));
        done();
      },
    });
  });

  it('should log error for very slow requests (>1000ms)', (done) => {
    jest.restoreAllMocks();
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2500); // 1500ms

    const errorSpy = jest.spyOn((interceptor as any).logger, 'error').mockImplementation();

    const ctx = createContext();
    const next = createCallHandler();

    interceptor.intercept(ctx, next).subscribe({
      next: () => {
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('SLOW'));
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('1500ms'));
        done();
      },
    });
  });

  it('should strip query params from URL in log', (done) => {
    const debugSpy = jest.spyOn((interceptor as any).logger, 'debug').mockImplementation();

    const ctx = createContext({ method: 'GET', url: '/api/v1/feed?cursor=abc&limit=20' });
    const next = createCallHandler();

    interceptor.intercept(ctx, next).subscribe({
      next: () => {
        const logMsg = debugSpy.mock.calls[0][0] as string;
        expect(logMsg).toContain('/api/v1/feed');
        expect(logMsg).not.toContain('cursor=abc');
        done();
      },
    });
  });

  it('should log metrics on error responses', (done) => {
    jest.restoreAllMocks();
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1050);

    const debugSpy = jest.spyOn((interceptor as any).logger, 'debug').mockImplementation();

    const err = new Error('Not found') as Error & { status?: number };
    err.status = 404;
    const ctx = createContext();
    const next = createErrorCallHandler(err);

    interceptor.intercept(ctx, next).subscribe({
      error: () => {
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('404'));
        done();
      },
    });
  });

  it('should default to status 500 on error without status', (done) => {
    jest.restoreAllMocks();
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1050);

    const debugSpy = jest.spyOn((interceptor as any).logger, 'debug').mockImplementation();

    const err = new Error('Unexpected');
    const ctx = createContext();
    const next = createErrorCallHandler(err);

    interceptor.intercept(ctx, next).subscribe({
      error: () => {
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
        done();
      },
    });
  });

  it('should default to 200 when response has no statusCode', (done) => {
    const debugSpy = jest.spyOn((interceptor as any).logger, 'debug').mockImplementation();

    const ctx = createContext(mockRequest, {} as any);
    const next = createCallHandler();

    interceptor.intercept(ctx, next).subscribe({
      next: () => {
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('200'));
        done();
      },
    });
  });
});
