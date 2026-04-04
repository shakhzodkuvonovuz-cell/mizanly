import { correlationStore, getCorrelationId } from './correlation-id.store';

describe('correlation-id.store', () => {
  describe('getCorrelationId', () => {
    it('should return undefined when not in a store context', () => {
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should return the correlation ID within a store context', () => {
      correlationStore.run('test-correlation-123', () => {
        expect(getCorrelationId()).toBe('test-correlation-123');
      });
    });

    it('should return undefined after exiting store context', () => {
      correlationStore.run('test-id', () => {
        // inside: present
        expect(getCorrelationId()).toBe('test-id');
      });
      // outside: gone
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should support nested contexts with correct isolation', () => {
      correlationStore.run('outer-id', () => {
        expect(getCorrelationId()).toBe('outer-id');

        correlationStore.run('inner-id', () => {
          expect(getCorrelationId()).toBe('inner-id');
        });

        // Back to outer after inner exits
        expect(getCorrelationId()).toBe('outer-id');
      });
    });

    it('should work with async operations within context', async () => {
      await new Promise<void>((resolve) => {
        correlationStore.run('async-id', async () => {
          // Simulate async work
          await new Promise<void>((r) => setTimeout(r, 10));
          expect(getCorrelationId()).toBe('async-id');
          resolve();
        });
      });
    });

    it('should handle UUID-format correlation IDs', () => {
      const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      correlationStore.run(uuid, () => {
        expect(getCorrelationId()).toBe(uuid);
      });
    });
  });

  describe('correlationStore', () => {
    it('should be an instance of AsyncLocalStorage', () => {
      // AsyncLocalStorage has run and getStore methods
      expect(typeof correlationStore.run).toBe('function');
      expect(typeof correlationStore.getStore).toBe('function');
    });

    it('getStore should return the same value as getCorrelationId', () => {
      correlationStore.run('store-check', () => {
        expect(correlationStore.getStore()).toBe(getCorrelationId());
      });
    });
  });
});
