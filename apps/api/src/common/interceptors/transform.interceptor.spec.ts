import { TransformInterceptor } from './transform.interceptor';
import { of } from 'rxjs';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;
  const mockContext = {} as any;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('should wrap plain data in { success, data, timestamp }', (done) => {
    const handler = { handle: () => of({ id: 'p1', content: 'test' }) };
    interceptor.intercept(mockContext, handler as any).subscribe((result) => {
      expect(result.success).toBe(true);
      expect((result as any).data).toEqual({ id: 'p1', content: 'test' });
      expect(result.timestamp).toBeDefined();
      done();
    });
  });

  it('should pass through paginated responses with data+meta envelope', (done) => {
    const paginatedData = { data: [{ id: 'p1' }], meta: { cursor: 'c1', hasMore: true } };
    const handler = { handle: () => of(paginatedData) };
    interceptor.intercept(mockContext, handler as any).subscribe((result) => {
      expect(result.success).toBe(true);
      expect((result as any).data).toEqual([{ id: 'p1' }]);
      expect((result as any).meta).toEqual({ cursor: 'c1', hasMore: true });
      done();
    });
  });

  it('should normalize null to empty object', (done) => {
    const handler = { handle: () => of(null) };
    interceptor.intercept(mockContext, handler as any).subscribe((result) => {
      expect(result.success).toBe(true);
      expect((result as any).data).toEqual({});
      done();
    });
  });

  it('should normalize undefined to empty object', (done) => {
    const handler = { handle: () => of(undefined) };
    interceptor.intercept(mockContext, handler as any).subscribe((result) => {
      expect(result.success).toBe(true);
      expect((result as any).data).toEqual({});
      done();
    });
  });

  it('should wrap string data correctly', (done) => {
    const handler = { handle: () => of('hello') };
    interceptor.intercept(mockContext, handler as any).subscribe((result) => {
      expect(result.success).toBe(true);
      expect((result as any).data).toBe('hello');
      done();
    });
  });

  it('should wrap number data correctly', (done) => {
    const handler = { handle: () => of(42) };
    interceptor.intercept(mockContext, handler as any).subscribe((result) => {
      expect(result.success).toBe(true);
      expect((result as any).data).toBe(42);
      done();
    });
  });
});
