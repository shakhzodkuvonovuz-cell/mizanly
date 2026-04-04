import { ResponseTimeMiddleware } from './response-time.middleware';

describe('ResponseTimeMiddleware', () => {
  let middleware: ResponseTimeMiddleware;
  let finishHandler: (() => void) | null;

  const createReq = (): any => ({
    method: 'GET',
    url: '/api/v1/test',
  });

  const createRes = (): any => {
    finishHandler = null;
    const headers: Record<string, string> = {};
    return {
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'finish') finishHandler = handler;
      }),
      setHeader: jest.fn((key: string, val: string) => {
        headers[key] = val;
      }),
      _headers: headers,
    };
  };

  beforeEach(() => {
    middleware = new ResponseTimeMiddleware();
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

  it('should set X-Response-Time header on finish', () => {
    const req = createReq();
    const res = createRes();

    middleware.use(req, res, jest.fn());

    // Simulate response finish
    finishHandler!();

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Response-Time',
      expect.stringMatching(/^\d+ms$/),
    );
  });

  it('should compute a non-negative duration', () => {
    const req = createReq();
    const res = createRes();

    middleware.use(req, res, jest.fn());
    finishHandler!();

    const headerVal = res.setHeader.mock.calls.find(
      (c: string[]) => c[0] === 'X-Response-Time',
    )?.[1] as string;
    const ms = parseInt(headerVal.replace('ms', ''), 10);
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it('should use process.hrtime.bigint for precision', () => {
    const spy = jest.spyOn(process.hrtime, 'bigint');

    const req = createReq();
    const res = createRes();

    middleware.use(req, res, jest.fn());
    finishHandler!();

    // Called once at start, once at finish
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);

    spy.mockRestore();
  });
});
