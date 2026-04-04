import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

/**
 * Helper to invoke a NestJS parameter decorator and get the returned factory function.
 * Parameter decorators created via createParamDecorator store metadata.
 * We extract that metadata and invoke it directly.
 */
function getParamDecoratorFactory(decorator: (...args: any[]) => ParameterDecorator) {
  // Create a dummy class with a method and apply the decorator
  class TestClass {
    testMethod() {
      // no-op
    }
  }
  decorator('id')(TestClass.prototype, 'testMethod', 0);
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'testMethod');
  // The key is in the format "custom:paramtype:index"
  const key = Object.keys(metadata)[0];
  return metadata[key].factory;
}

function createMockExecutionContext(user: Record<string, unknown> | null): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => jest.fn(),
    }),
    getHandler: () => function testHandler() {},
    getClass: () => ({ name: 'TestController' }) as any,
    getType: () => 'http' as any,
    getArgs: () => [] as any,
    getArgByIndex: () => ({}) as any,
    switchToRpc: () => ({}) as any,
    switchToWs: () => ({}) as any,
  } as unknown as ExecutionContext;
}

describe('CurrentUser decorator', () => {
  let factory: (data: string | undefined, ctx: ExecutionContext) => unknown;

  beforeAll(() => {
    factory = getParamDecoratorFactory(CurrentUser);
  });

  it('should return user.id when data is "id"', () => {
    const ctx = createMockExecutionContext({ id: 'user-123', email: 'test@test.com' });
    const result = factory('id', ctx);
    expect(result).toBe('user-123');
  });

  it('should return the full user object when data is undefined', () => {
    const user = { id: 'user-456', email: 'test@test.com', role: 'admin' };
    const ctx = createMockExecutionContext(user);
    const result = factory(undefined, ctx);
    expect(result).toEqual(user);
  });

  it('should return specific property when data is provided', () => {
    const user = { id: 'user-789', email: 'admin@test.com', role: 'moderator' };
    const ctx = createMockExecutionContext(user);
    expect(factory('email', ctx)).toBe('admin@test.com');
    expect(factory('role', ctx)).toBe('moderator');
  });

  it('should return undefined when user is null and data is provided', () => {
    const ctx = createMockExecutionContext(null);
    const result = factory('id', ctx);
    expect(result).toBeUndefined();
  });

  it('should return null/undefined when user is null and no data', () => {
    const ctx = createMockExecutionContext(null);
    const result = factory(undefined, ctx);
    expect(result).toBeNull();
  });

  it('should return undefined for non-existent property', () => {
    const ctx = createMockExecutionContext({ id: 'user-999' });
    const result = factory('nonExistent', ctx);
    expect(result).toBeUndefined();
  });
});
