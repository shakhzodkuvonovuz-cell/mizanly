import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { correlationStore, getCorrelationId } from './correlation-id.store';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  const createReq = (correlationId?: string | string[]): any => ({
    headers: correlationId !== undefined ? { 'x-correlation-id': correlationId } : {},
    id: undefined as string | undefined,
  });

  const createRes = (): any => {
    const headers: Record<string, string> = {};
    return {
      setHeader: jest.fn((key: string, val: string) => { headers[key] = val; }),
      _headers: headers,
    };
  };

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should use incoming x-correlation-id header', (done) => {
    const req = createReq('existing-id-123');
    const res = createRes();

    middleware.use(req, res, () => {
      expect(req.headers['x-correlation-id']).toBe('existing-id-123');
      expect(req.id).toBe('existing-id-123');
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'existing-id-123');
      done();
    });
  });

  it('should generate UUID when no correlation id header present', (done) => {
    const req = createReq();
    const res = createRes();

    middleware.use(req, res, () => {
      expect(req.headers['x-correlation-id']).toBeDefined();
      expect(typeof req.headers['x-correlation-id']).toBe('string');
      // UUID v4 format
      expect(req.headers['x-correlation-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(req.id).toBe(req.headers['x-correlation-id']);
      done();
    });
  });

  it('should use first element when correlation id is an array', (done) => {
    const req = createReq(['first-id', 'second-id']);
    const res = createRes();

    middleware.use(req, res, () => {
      expect(req.headers['x-correlation-id']).toBe('first-id');
      expect(req.id).toBe('first-id');
      done();
    });
  });

  it('should generate UUID when array has empty first element', (done) => {
    const req = createReq(['', 'second-id']);
    const res = createRes();

    middleware.use(req, res, () => {
      expect(req.headers['x-correlation-id']).toBeDefined();
      expect((req.headers['x-correlation-id'] as string).length).toBeGreaterThan(0);
      done();
    });
  });

  it('should set correlation id in response header', (done) => {
    const req = createReq('test-corr-id');
    const res = createRes();

    middleware.use(req, res, () => {
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'test-corr-id');
      done();
    });
  });

  it('should store correlation id in AsyncLocalStorage', (done) => {
    const req = createReq('async-storage-id');
    const res = createRes();

    middleware.use(req, res, () => {
      const stored = correlationStore.getStore();
      expect(stored).toBe('async-storage-id');
      done();
    });
  });

  it('should call next function', (done) => {
    const req = createReq();
    const res = createRes();

    middleware.use(req, res, () => {
      done(); // next was called
    });
  });
});

describe('correlationStore', () => {
  it('should return undefined outside of a request context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it('should return stored value inside correlationStore.run', (done) => {
    correlationStore.run('test-123', () => {
      expect(getCorrelationId()).toBe('test-123');
      done();
    });
  });

  it('should isolate values between concurrent runs', (done) => {
    let count = 0;
    const finish = () => { count++; if (count === 2) done(); };

    correlationStore.run('run-a', () => {
      expect(getCorrelationId()).toBe('run-a');
      finish();
    });

    correlationStore.run('run-b', () => {
      expect(getCorrelationId()).toBe('run-b');
      finish();
    });
  });
});
