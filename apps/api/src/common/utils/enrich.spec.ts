import { enrichPostsForUser, enrichReelsForUser } from './enrich';

describe('enrichPostsForUser', () => {
  const mockPrisma: any = {
    postReaction: { findMany: jest.fn() },
    savedPost: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty array for empty input', async () => {
    const result = await enrichPostsForUser(mockPrisma, [], 'user-1');

    expect(result).toEqual([]);
    expect(mockPrisma.postReaction.findMany).not.toHaveBeenCalled();
  });

  it('should enrich posts with user reactions and saved status', async () => {
    const posts = [
      { id: 'post-1', content: 'Hello' },
      { id: 'post-2', content: 'World' },
      { id: 'post-3', content: 'Foo' },
    ];

    mockPrisma.postReaction.findMany.mockResolvedValue([
      { postId: 'post-1', reaction: 'love' },
      { postId: 'post-3', reaction: 'like' },
    ]);
    mockPrisma.savedPost.findMany.mockResolvedValue([
      { postId: 'post-2' },
    ]);

    const result = await enrichPostsForUser(mockPrisma, posts, 'user-1');

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      id: 'post-1', content: 'Hello', userReaction: 'love', isSaved: false,
    });
    expect(result[1]).toEqual({
      id: 'post-2', content: 'World', userReaction: null, isSaved: true,
    });
    expect(result[2]).toEqual({
      id: 'post-3', content: 'Foo', userReaction: 'like', isSaved: false,
    });
  });

  it('should query reactions and saves for the correct user and post IDs', async () => {
    const posts = [{ id: 'p1' }, { id: 'p2' }];
    mockPrisma.postReaction.findMany.mockResolvedValue([]);
    mockPrisma.savedPost.findMany.mockResolvedValue([]);

    await enrichPostsForUser(mockPrisma, posts, 'user-42');

    expect(mockPrisma.postReaction.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-42', postId: { in: ['p1', 'p2'] } },
      select: { postId: true, reaction: true },
      take: 50,
    });
    expect(mockPrisma.savedPost.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-42', postId: { in: ['p1', 'p2'] } },
      select: { postId: true },
      take: 50,
    });
  });

  it('should return null userReaction and false isSaved when no data', async () => {
    const posts = [{ id: 'post-x' }];
    mockPrisma.postReaction.findMany.mockResolvedValue([]);
    mockPrisma.savedPost.findMany.mockResolvedValue([]);

    const result = await enrichPostsForUser(mockPrisma, posts, 'user-1');

    expect(result[0].userReaction).toBeNull();
    expect(result[0].isSaved).toBe(false);
  });

  it('should preserve all original post fields', async () => {
    const posts = [{ id: 'p1', content: 'text', mediaUrls: ['url1'], likesCount: 5 }];
    mockPrisma.postReaction.findMany.mockResolvedValue([]);
    mockPrisma.savedPost.findMany.mockResolvedValue([]);

    const result = await enrichPostsForUser(mockPrisma, posts, 'user-1');

    expect(result[0].content).toBe('text');
    expect(result[0].mediaUrls).toEqual(['url1']);
    expect(result[0].likesCount).toBe(5);
  });
});

describe('enrichReelsForUser', () => {
  const mockPrisma: any = {
    reelReaction: { findMany: jest.fn() },
    reelInteraction: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty array for empty input', async () => {
    const result = await enrichReelsForUser(mockPrisma, [], 'user-1');

    expect(result).toEqual([]);
    expect(mockPrisma.reelReaction.findMany).not.toHaveBeenCalled();
  });

  it('should enrich reels with user reactions and saved status', async () => {
    const reels = [
      { id: 'reel-1', videoUrl: 'url1' },
      { id: 'reel-2', videoUrl: 'url2' },
    ];

    mockPrisma.reelReaction.findMany.mockResolvedValue([
      { reelId: 'reel-1', reaction: 'fire' },
    ]);
    mockPrisma.reelInteraction.findMany.mockResolvedValue([
      { reelId: 'reel-2' },
    ]);

    const result = await enrichReelsForUser(mockPrisma, reels, 'user-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'reel-1', videoUrl: 'url1', userReaction: 'fire', isSaved: false,
    });
    expect(result[1]).toEqual({
      id: 'reel-2', videoUrl: 'url2', userReaction: null, isSaved: true,
    });
  });

  it('should query reel interactions with saved: true filter', async () => {
    const reels = [{ id: 'r1' }];
    mockPrisma.reelReaction.findMany.mockResolvedValue([]);
    mockPrisma.reelInteraction.findMany.mockResolvedValue([]);

    await enrichReelsForUser(mockPrisma, reels, 'user-99');

    expect(mockPrisma.reelInteraction.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-99', reelId: { in: ['r1'] }, saved: true },
      select: { reelId: true },
      take: 50,
    });
  });

  it('should return null userReaction and false isSaved for no matching data', async () => {
    const reels = [{ id: 'reel-orphan' }];
    mockPrisma.reelReaction.findMany.mockResolvedValue([]);
    mockPrisma.reelInteraction.findMany.mockResolvedValue([]);

    const result = await enrichReelsForUser(mockPrisma, reels, 'user-1');

    expect(result[0].userReaction).toBeNull();
    expect(result[0].isSaved).toBe(false);
  });
});
