import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

const STORY_SELECT = {
  id: true,
  mediaUrl: true,
  mediaType: true,
  thumbnailUrl: true,
  duration: true,
  textOverlay: true,
  textColor: true,
  bgColor: true,
  viewsCount: true,
  repliesCount: true,
  isHighlight: true,
  highlightName: true,
  highlightAlbumId: true,
  stickerData: true,
  closeFriendsOnly: true,
  isArchived: true,
  expiresAt: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};

@Injectable()
export class StoriesService {
  constructor(private prisma: PrismaService) {}

  async getFeedStories(userId: string) {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const ids = [userId, ...follows.map((f) => f.followingId)];

    const stories = await this.prisma.story.findMany({
      where: {
        userId: { in: ids },
        expiresAt: { gt: new Date() },
        isArchived: false,
      },
      select: STORY_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Group by user
    const grouped = new Map<
      string,
      { user: (typeof stories)[0]['user']; stories: typeof stories; hasUnread: boolean }
    >();

    for (const story of stories) {
      const key = story.user.id;
      if (!grouped.has(key)) {
        grouped.set(key, { user: story.user, stories: [], hasUnread: false });
      }
      grouped.get(key)!.stories.push(story);
    }

    // Check which stories the current user has already seen
    const storyIds = stories.map((s) => s.id);
    const views = await this.prisma.storyView.findMany({
      where: { viewerId: userId, storyId: { in: storyIds } },
      select: { storyId: true },
    });
    const viewedIds = new Set(views.map((v) => v.storyId));

    const result = Array.from(grouped.values()).map((group) => ({
      ...group,
      hasUnread: group.stories.some((s) => !viewedIds.has(s.id)),
    }));

    // Sort: own stories first, then by hasUnread, then by latest story
    result.sort((a, b) => {
      if (a.user.id === userId) return -1;
      if (b.user.id === userId) return 1;
      if (a.hasUnread && !b.hasUnread) return -1;
      if (!a.hasUnread && b.hasUnread) return 1;
      return 0;
    });

    return result;
  }

  async create(
    userId: string,
    data: {
      mediaUrl: string;
      mediaType: string;
      thumbnailUrl?: string;
      duration?: number;
      textOverlay?: string;
      textColor?: string;
      bgColor?: string;
      stickerData?: object;
      closeFriendsOnly?: boolean;
    },
  ) {
    return this.prisma.story.create({
      data: {
        userId,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        thumbnailUrl: data.thumbnailUrl,
        duration: data.duration,
        textOverlay: data.textOverlay,
        textColor: data.textColor,
        bgColor: data.bgColor,
        stickerData: data.stickerData as any,
        closeFriendsOnly: data.closeFriendsOnly ?? false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: STORY_SELECT,
    });
  }

  async getById(storyId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: STORY_SELECT,
    });
    if (!story) throw new NotFoundException('Story not found');
    return story;
  }

  async delete(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();

    await this.prisma.story.update({
      where: { id: storyId },
      data: { isArchived: true },
    });
    return { deleted: true };
  }

  async markViewed(storyId: string, viewerId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');

    const alreadyViewed = await this.prisma.storyView.findUnique({
      where: { storyId_viewerId: { storyId, viewerId } },
    });

    if (!alreadyViewed) {
      await this.prisma.$transaction([
        this.prisma.storyView.create({ data: { storyId, viewerId } }),
        this.prisma.story.update({
          where: { id: storyId },
          data: { viewsCount: { increment: 1 } },
        }),
      ]);
    }

    return { viewed: true };
  }

  async getViewers(storyId: string, ownerId: string, cursor?: string, limit = 50) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== ownerId) throw new ForbiddenException('Only owner can see viewers');

    const views = await this.prisma.storyView.findMany({
      where: { storyId },
      include: {
        // StoryView has no User relation directly — get viewerId and look up users
      },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
    });

    // Fetch user details separately
    const viewerIds = views.map((v) => v.viewerId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: viewerIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    const hasMore = views.length > limit;
    const items = hasMore ? views.slice(0, limit) : views;

    return {
      data: items.map((v) => ({ ...userMap.get(v.viewerId), viewedAt: v.createdAt })),
      meta: { cursor: hasMore ? items[items.length - 1].viewerId : null, hasMore },
    };
  }

  async getHighlights(userId: string) {
    return this.prisma.storyHighlightAlbum.findMany({
      where: { userId },
      include: {
        stories: {
          where: { isArchived: true },
          select: { id: true, mediaUrl: true, mediaType: true, thumbnailUrl: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { position: 'asc' },
    });
  }

  async createHighlight(userId: string, title: string, coverUrl?: string) {
    const count = await this.prisma.storyHighlightAlbum.count({ where: { userId } });
    return this.prisma.storyHighlightAlbum.create({
      data: { userId, title, coverUrl, position: count },
    });
  }

  async updateHighlight(albumId: string, userId: string, data: { title?: string; coverUrl?: string }) {
    const album = await this.prisma.storyHighlightAlbum.findUnique({ where: { id: albumId } });
    if (!album) throw new NotFoundException('Highlight not found');
    if (album.userId !== userId) throw new ForbiddenException();

    return this.prisma.storyHighlightAlbum.update({ where: { id: albumId }, data });
  }

  async deleteHighlight(albumId: string, userId: string) {
    const album = await this.prisma.storyHighlightAlbum.findUnique({ where: { id: albumId } });
    if (!album) throw new NotFoundException('Highlight not found');
    if (album.userId !== userId) throw new ForbiddenException();

    await this.prisma.storyHighlightAlbum.delete({ where: { id: albumId } });
    return { deleted: true };
  }

  async addStoryToHighlight(storyId: string, albumId: string, userId: string) {
    const [story, album] = await Promise.all([
      this.prisma.story.findUnique({ where: { id: storyId } }),
      this.prisma.storyHighlightAlbum.findUnique({ where: { id: albumId } }),
    ]);
    if (!story || !album) throw new NotFoundException();
    if (story.userId !== userId || album.userId !== userId) throw new ForbiddenException();

    return this.prisma.story.update({
      where: { id: storyId },
      data: { highlightAlbumId: albumId, isHighlight: true, isArchived: true },
    });
  }
}
