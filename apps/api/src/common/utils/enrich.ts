import { PrismaService } from '../../config/prisma.service';

/**
 * Shared enrichment utilities for adding per-user reaction/saved status to content.
 *
 * Extracted from duplicate implementations across posts.service, hashtags.service,
 * reels.service, and videos.service (Audit 21 F24).
 *
 * Each enrichment function:
 * 1. Takes an array of content items with `id` field
 * 2. Batch-fetches the user's reactions and saved status
 * 3. Returns items with `userReaction` and `isSaved` appended
 */

export async function enrichPostsForUser<T extends { id: string }>(
  prisma: PrismaService,
  posts: T[],
  userId: string,
): Promise<(T & { userReaction: string | null; isSaved: boolean })[]> {
  if (!posts.length) return [];
  const postIds = posts.map(p => p.id);
  const [reactions, saves] = await Promise.all([
    prisma.postReaction.findMany({
      where: { userId, postId: { in: postIds } },
      select: { postId: true, reaction: true },
      take: 50,
    }),
    prisma.savedPost.findMany({
      where: { userId, postId: { in: postIds } },
      select: { postId: true },
      take: 50,
    }),
  ]);
  const reactionMap = new Map(reactions.map(r => [r.postId, r.reaction]));
  const savedSet = new Set(saves.map(s => s.postId));
  return posts.map(post => ({
    ...post,
    userReaction: reactionMap.get(post.id) ?? null,
    isSaved: savedSet.has(post.id),
  }));
}

export async function enrichReelsForUser<T extends { id: string }>(
  prisma: PrismaService,
  reels: T[],
  userId: string,
): Promise<(T & { userReaction: string | null; isSaved: boolean })[]> {
  if (!reels.length) return [];
  const reelIds = reels.map(r => r.id);
  const [reactions, saved] = await Promise.all([
    prisma.reelReaction.findMany({
      where: { userId, reelId: { in: reelIds } },
      select: { reelId: true, reaction: true },
      take: 50,
    }),
    prisma.reelInteraction.findMany({
      where: { userId, reelId: { in: reelIds }, saved: true },
      select: { reelId: true },
      take: 50,
    }),
  ]);
  const reactionMap = new Map(reactions.map(r => [r.reelId, r.reaction]));
  const savedSet = new Set(saved.map(s => s.reelId));
  return reels.map(reel => ({
    ...reel,
    userReaction: reactionMap.get(reel.id) ?? null,
    isSaved: savedSet.has(reel.id),
  }));
}

