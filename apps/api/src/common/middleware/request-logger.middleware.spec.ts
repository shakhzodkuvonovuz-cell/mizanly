import { RequestLoggerMiddleware } from './request-logger.middleware';

describe('RequestLoggerMiddleware', () => {
  let middleware: RequestLoggerMiddleware;
  let finishHandler: (() => void) | null;

  const createReq = (method = 'GET', url = '/api/v1/posts'): any => ({
    method,
    originalUrl: url,
    url,
  });

  const createRes = (statusCode = 200): any => {
    finishHandler = null;
    return {
      statusCode,
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'finish') finishHandler = handler;
      }),
    };
  };

  beforeEach(() => {
    middleware = new RequestLoggerMiddleware();
    jest.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should call next()', () => {
    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should register a finish listener on response', () => {
    const req = createReq();
    const res = createRes();

    middleware.use(req, res, jest.fn());

    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should track request count', () => {
    const req = createReq();
    const res = createRes();

    middleware.use(req, res, jest.fn());
    middleware.use(req, createRes(), jest.fn());
    middleware.use(req, createRes(), jest.fn());

    const stats = middleware.getStats();
    expect(stats.totalRequests).toBe(3);
  });

  it('should track 5xx as errors', () => {
    const errorSpy = jest.spyOn((middleware as any).logger, 'error').mockImplementation();
    const req = createReq();
    const res = createRes(500);

    middleware.use(req, res, jest.fn());

    // Simulate response finish
    jest.spyOn(Date, 'now').mockReturnValue(1100); // 100ms
    finishHandler!();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
    const stats = middleware.getStats();
    expect(stats.errorCount).toBe(1);
  });

  it('should log warn for 4xx (non-auth endpoints)', () => {
    const warnSpy = jest.spyOn((middleware as any).logger, 'warn').mockImplementation();
    const req = createReq('POST', '/api/v1/posts');
    const res = createRes(400);

    middleware.use(req, res, jest.fn());
    jest.spyOn(Date, 'now').mockReturnValue(1050);
    finishHandler!();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('400'));
  });

  it('should NOT log warn for 401 responses', () => {
    const warnSpy = jest.spyOn((middleware as any).logger, 'warn').mockImplementation();
    const req = createReq('GET', '/api/v1/users/me');
    const res = createRes(401);

    middleware.use(req, res, jest.fn());
    jest.spyOn(Date, 'now').mockReturnValue(1050);
    finishHandler!();

    // 401 should not produce a warn log
    const warnCalls = warnSpy.mock.calls.filter(c => (c[0] as string).includes('401'));
    expect(warnCalls).toHaveLength(0);
  });

  it('should NOT log warn for 429 rate-limited responses', () => {
    const warnSpy = jest.spyOn((middleware as any).logger, 'warn').mockImplementation();
    const req = createReq('POST', '/api/v1/posts');
    const res = createRes(429);

    middleware.use(req, res, jest.fn());
    jest.spyOn(Date, 'now').mockReturnValue(1050);
    finishHandler!();

    const warnCalls = warnSpy.mock.calls.filter(c => (c[0] as string).includes('429'));
    expect(warnCalls).toHaveLength(0);
  });

  it('should NOT log warn for auth endpoint 4xx', () => {
    const warnSpy = jest.spyOn((middleware as any).logger, 'warn').mockImplementation();
    const req = createReq('POST', '/api/v1/auth/login');
    const res = createRes(403);

    middleware.use(req, res, jest.fn());
    jest.spyOn(Date, 'now').mockReturnValue(1050);
    finishHandler!();

    const warnCalls = warnSpy.mock.calls.filter(c => (c[0] as string).includes('403'));
    expect(warnCalls).toHaveLength(0);
  });

  it('should track slow requests (>500ms)', () => {
    const warnSpy = jest.spyOn((middleware as any).logger, 'warn').mockImplementation();
    const req = createReq();
    const res = createRes(200);

    middleware.use(req, res, jest.fn());
    jest.spyOn(Date, 'now').mockReturnValue(1600); // 600ms
    finishHandler!();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SLOW'));
    const stats = middleware.getStats();
    expect(stats.slowRequests).toBe(1);
  });

  it('should calculate error rate correctly', () => {
    const errorSpy = jest.spyOn((middleware as any).logger, 'error').mockImplementation();

    // 10 requests, 2 errors
    for (let i = 0; i < 10; i++) {
      const req = createReq();
      const res = createRes(i < 2 ? 500 : 200);
      middleware.use(req, res, jest.fn());
      jest.spyOn(Date, 'now').mockReturnValue(1050);
      finishHandler!();
    }

    const stats = middleware.getStats();
    expect(stats.totalRequests).toBe(10);
    expect(stats.errorCount).toBe(2);
    expect(stats.errorRate).toBe('20.00%');
  });

  it('should return 0% error rate with no requests', () => {
    const freshMiddleware = new RequestLoggerMiddleware();
    const stats = freshMiddleware.getStats();
    expect(stats.errorRate).toBe('0%');
  });

  it('should use originalUrl when available', () => {
    const errorSpy = jest.spyOn((middleware as any).logger, 'error').mockImplementation();
    const req = { method: 'GET', originalUrl: '/api/v1/original', url: '/api/v1/fallback' } as any;
    const res = createRes(500);

    middleware.use(req, res, jest.fn());
    jest.spyOn(Date, 'now').mockReturnValue(1050);
    finishHandler!();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('/api/v1/original'));
  });
});
