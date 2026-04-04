import { getExcludedUserIds } from './excluded-users';

describe('getExcludedUserIds', () => {
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma = {
      block: { findMany: jest.fn().mockResolvedValue([]) },
      mute: { findMany: jest.fn().mockResolvedValue([]) },
      restrict: { findMany: jest.fn().mockResolvedValue([]) },
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
  });

  it('should return cached value when available in Redis', async () => {
    const cached = ['blocked-1', 'muted-1'];
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await getExcludedUserIds(mockPrisma, mockRedis, 'user-1');

    expect(result).toEqual(cached);
    expect(mockPrisma.block.findMany).not.toHaveBeenCalled();
  });

  it('should query DB on cache miss and cache the result', async () => {
    mockPrisma.block.findMany.mockResolvedValue([
      { blockerId: 'user-1', blockedId: 'blocked-a' },
      { blockerId: 'blocked-b', blockedId: 'user-1' }, // reverse block
    ]);
    mockPrisma.mute.findMany.mockResolvedValue([
      { mutedId: 'muted-c' },
    ]);
    mockPrisma.restrict.findMany.mockResolvedValue([
      { restrictedId: 'restricted-d' },
    ]);

    const result = await getExcludedUserIds(mockPrisma, mockRedis, 'user-1');

    expect(result).toContain('blocked-a');
    expect(result).toContain('blocked-b');
    expect(result).toContain('muted-c');
    expect(result).toContain('restricted-d');
    expect(result).toHaveLength(4);

    // Should cache the result
    expect(mockRedis.set).toHaveBeenCalledWith(
      'excluded:users:user-1',
      expect.any(String),
      'EX',
      60,
    );
  });

  it('should include both directions of blocks', async () => {
    mockPrisma.block.findMany.mockResolvedValue([
      { blockerId: 'user-1', blockedId: 'target-1' }, // user blocked target
      { blockerId: 'target-2', blockedId: 'user-1' }, // target blocked user
    ]);
    mockPrisma.mute.findMany.mockResolvedValue([]);
    mockPrisma.restrict.findMany.mockResolvedValue([]);

    const result = await getExcludedUserIds(mockPrisma, mockRedis, 'user-1');

    expect(result).toContain('target-1');
    expect(result).toContain('target-2');
  });

  it('should deduplicate users that appear in multiple lists', async () => {
    // Same user is blocked AND muted
    mockPrisma.block.findMany.mockResolvedValue([
      { blockerId: 'user-1', blockedId: 'same-user' },
    ]);
    mockPrisma.mute.findMany.mockResolvedValue([
      { mutedId: 'same-user' },
    ]);
    mockPrisma.restrict.findMany.mockResolvedValue([]);

    const result = await getExcludedUserIds(mockPrisma, mockRedis, 'user-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toBe('same-user');
  });

  it('should return empty array when no exclusions exist', async () => {
    const result = await getExcludedUserIds(mockPrisma, mockRedis, 'user-1');

    expect(result).toEqual([]);
  });

  it('should fallback to DB when Redis get fails', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis down'));
    mockPrisma.block.findMany.mockResolvedValue([
      { blockerId: 'user-1', blockedId: 'fallback-user' },
    ]);
    mockPrisma.mute.findMany.mockResolvedValue([]);
    mockPrisma.restrict.findMany.mockResolvedValue([]);

    const result = await getExcludedUserIds(mockPrisma, mockRedis, 'user-1');

    expect(result).toContain('fallback-user');
  });

  it('should not crash when Redis set fails', async () => {
    mockRedis.set.mockRejectedValue(new Error('Redis down'));
    mockPrisma.block.findMany.mockResolvedValue([
      { blockerId: 'user-1', blockedId: 'some-user' },
    ]);
    mockPrisma.mute.findMany.mockResolvedValue([]);
    mockPrisma.restrict.findMany.mockResolvedValue([]);

    const result = await getExcludedUserIds(mockPrisma, mockRedis, 'user-1');

    expect(result).toContain('some-user');
  });

  it('should skip Redis caching for large sets (>1000 IDs)', async () => {
    // Generate 1001 blocks
    const manyBlocks = Array.from({ length: 1001 }, (_, i) => ({
      blockerId: 'user-1',
      blockedId: `blocked-${i}`,
    }));
    mockPrisma.block.findMany.mockResolvedValue(manyBlocks);
    mockPrisma.mute.findMany.mockResolvedValue([]);
    mockPrisma.restrict.findMany.mockResolvedValue([]);

    const result = await getExcludedUserIds(mockPrisma, mockRedis, 'user-1');

    expect(result).toHaveLength(1001);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('should cache sets with exactly 1000 IDs', async () => {
    const blocks = Array.from({ length: 1000 }, (_, i) => ({
      blockerId: 'user-1',
      blockedId: `blocked-${i}`,
    }));
    mockPrisma.block.findMany.mockResolvedValue(blocks);
    mockPrisma.mute.findMany.mockResolvedValue([]);
    mockPrisma.restrict.findMany.mockResolvedValue([]);

    await getExcludedUserIds(mockPrisma, mockRedis, 'user-1');

    expect(mockRedis.set).toHaveBeenCalled();
  });

  it('should query blocks with bidirectional OR condition', async () => {
    mockPrisma.block.findMany.mockResolvedValue([]);
    mockPrisma.mute.findMany.mockResolvedValue([]);
    mockPrisma.restrict.findMany.mockResolvedValue([]);

    await getExcludedUserIds(mockPrisma, mockRedis, 'user-42');

    expect(mockPrisma.block.findMany).toHaveBeenCalledWith({
      where: { OR: [{ blockerId: 'user-42' }, { blockedId: 'user-42' }] },
      select: { blockerId: true, blockedId: true },
      take: 10000,
    });
  });

  it('should query mutes for the requesting user only', async () => {
    mockPrisma.block.findMany.mockResolvedValue([]);
    mockPrisma.mute.findMany.mockResolvedValue([]);
    mockPrisma.restrict.findMany.mockResolvedValue([]);

    await getExcludedUserIds(mockPrisma, mockRedis, 'user-42');

    expect(mockPrisma.mute.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-42' },
      select: { mutedId: true },
      take: 10000,
    });
  });

  it('should query restricts for the requesting user as restricter', async () => {
    mockPrisma.block.findMany.mockResolvedValue([]);
    mockPrisma.mute.findMany.mockResolvedValue([]);
    mockPrisma.restrict.findMany.mockResolvedValue([]);

    await getExcludedUserIds(mockPrisma, mockRedis, 'user-42');

    expect(mockPrisma.restrict.findMany).toHaveBeenCalledWith({
      where: { restricterId: 'user-42' },
      select: { restrictedId: true },
      take: 10000,
    });
  });
});
