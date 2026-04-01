import { acquireCronLock } from './cron-lock';
import { Logger } from '@nestjs/common';

describe('acquireCronLock', () => {
  const logger = new Logger('TestCron');

  it('should return true when Redis SET NX succeeds', async () => {
    const redis = { set: jest.fn().mockResolvedValue('OK') } as any;
    const result = await acquireCronLock(redis, 'cron:test', 55, logger);
    expect(result).toBe(true);
    expect(redis.set).toHaveBeenCalledWith('cron:test', '1', 'EX', 55, 'NX');
  });

  it('should return false when Redis SET NX returns null (lock held)', async () => {
    const redis = { set: jest.fn().mockResolvedValue(null) } as any;
    const result = await acquireCronLock(redis, 'cron:test', 55, logger);
    expect(result).toBe(false);
  });

  it('should pass correct TTL for minute-interval crons', async () => {
    const redis = { set: jest.fn().mockResolvedValue('OK') } as any;
    await acquireCronLock(redis, 'cron:publishOverdue', 55, logger);
    expect(redis.set).toHaveBeenCalledWith('cron:publishOverdue', '1', 'EX', 55, 'NX');
  });

  it('should pass correct TTL for daily crons', async () => {
    const redis = { set: jest.fn().mockResolvedValue('OK') } as any;
    await acquireCronLock(redis, 'cron:dailyJob', 3500, logger);
    expect(redis.set).toHaveBeenCalledWith('cron:dailyJob', '1', 'EX', 3500, 'NX');
  });

  it('should work without logger', async () => {
    const redis = { set: jest.fn().mockResolvedValue(null) } as any;
    const result = await acquireCronLock(redis, 'cron:test', 55);
    expect(result).toBe(false);
  });

  it('should propagate Redis errors', async () => {
    const redis = { set: jest.fn().mockRejectedValue(new Error('Connection refused')) } as any;
    await expect(acquireCronLock(redis, 'cron:test', 55, logger)).rejects.toThrow('Connection refused');
  });

  it('should use unique keys per cron job', async () => {
    const redis = { set: jest.fn().mockResolvedValue('OK') } as any;
    await acquireCronLock(redis, 'cron:jobA', 55, logger);
    await acquireCronLock(redis, 'cron:jobB', 55, logger);
    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenNthCalledWith(1, 'cron:jobA', '1', 'EX', 55, 'NX');
    expect(redis.set).toHaveBeenNthCalledWith(2, 'cron:jobB', '1', 'EX', 55, 'NX');
  });
});
