import { attachCorrelationId } from './with-correlation';
import * as Sentry from '@sentry/node';

jest.mock('@sentry/node', () => ({
  withScope: jest.fn((cb: (scope: { setTag: jest.Mock }) => void) => {
    cb({ setTag: jest.fn() });
  }),
}));

describe('with-correlation', () => {
  describe('attachCorrelationId', () => {
    const mockLogger = {
      debug: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should extract correlationId from job data and return it', () => {
      const job = {
        id: 'job-123',
        name: 'test-job',
        data: { correlationId: 'corr-abc-123', payload: 'test' },
      } as any;

      const result = attachCorrelationId(job, mockLogger);
      expect(result).toBe('corr-abc-123');
    });

    it('should attach correlationId to Sentry scope', () => {
      const job = {
        id: 'job-123',
        name: 'test-job',
        data: { correlationId: 'corr-xyz' },
      } as any;

      attachCorrelationId(job, mockLogger);
      expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    });

    it('should log debug message with correlation ID and job info', () => {
      const job = {
        id: 'job-456',
        name: 'send-email',
        data: { correlationId: 'corr-debug' },
      } as any;

      attachCorrelationId(job, mockLogger);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('corr-debug'),
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('job-456'),
      );
    });

    it('should return undefined when job data has no correlationId', () => {
      const job = {
        id: 'job-789',
        name: 'other-job',
        data: { someField: 'value' },
      } as any;

      const result = attachCorrelationId(job, mockLogger);
      expect(result).toBeUndefined();
    });

    it('should not call Sentry.withScope when no correlationId', () => {
      const job = {
        id: 'job-000',
        name: 'no-corr',
        data: {},
      } as any;

      attachCorrelationId(job, mockLogger);
      expect(Sentry.withScope).not.toHaveBeenCalled();
    });

    it('should not log when no correlationId', () => {
      const job = {
        id: 'job-nolog',
        name: 'silent',
        data: { payload: 'test' },
      } as any;

      attachCorrelationId(job, mockLogger);
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle undefined job data gracefully', () => {
      const job = {
        id: 'job-undef',
        name: 'undef-data',
        data: undefined,
      } as any;

      const result = attachCorrelationId(job, mockLogger);
      expect(result).toBeUndefined();
    });

    it('should handle null correlationId in data', () => {
      const job = {
        id: 'job-null',
        name: 'null-corr',
        data: { correlationId: null },
      } as any;

      const result = attachCorrelationId(job, mockLogger);
      // null is falsy, so no Sentry/logging
      expect(result).toBeNull();
      expect(Sentry.withScope).not.toHaveBeenCalled();
    });
  });
});
