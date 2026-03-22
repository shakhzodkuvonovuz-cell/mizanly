import { SecurityHeadersMiddleware } from './security-headers.middleware';

describe('SecurityHeadersMiddleware', () => {
  let middleware: SecurityHeadersMiddleware;
  let res: { setHeader: jest.Mock };
  let next: jest.Mock;

  beforeEach(() => {
    middleware = new SecurityHeadersMiddleware();
    res = { setHeader: jest.fn() };
    next = jest.fn();
  });

  it('should set X-Content-Type-Options to nosniff', () => {
    middleware.use({} as any, res as any, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });

  it('should set X-Frame-Options to DENY', () => {
    middleware.use({} as any, res as any, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  });

  it('should set X-XSS-Protection to 0', () => {
    middleware.use({} as any, res as any, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '0');
  });

  it('should set Referrer-Policy to strict-origin-when-cross-origin', () => {
    middleware.use({} as any, res as any, next);
    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  it('should set Permissions-Policy to deny camera, microphone, geolocation', () => {
    middleware.use({} as any, res as any, next);
    expect(res.setHeader).toHaveBeenCalledWith('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  });

  it('should call next() after setting all headers', () => {
    middleware.use({} as any, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledTimes(5);
  });
});
