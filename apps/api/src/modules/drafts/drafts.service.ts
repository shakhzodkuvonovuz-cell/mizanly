import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ContentSpace, PostType, VideoCategory } from '@prisma/client';
import { Prisma } from '@prisma/client';

const VALID_SPACES: string[] = Object.values(ContentSpace);

@Injectable()
export class DraftsService {
  private readonly logger = new Logger(DraftsService.name);

  constructor(private prisma: PrismaService) {}

  async getDrafts(userId: string, space?: string) {
    const where: Prisma.DraftPostWhereInput = { userId };
    if (space) {
      if (!VALID_SPACES.includes(space)) {
        throw new BadRequestException(`Invalid space: ${space}`);
      }
      where.space = space as ContentSpace;
    }

    return this.prisma.draftPost.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async getDraft(draftId: string, userId: string) {
    const draft = await this.prisma.draftPost.findUnique({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.userId !== userId) throw new ForbiddenException();
    return draft;
  }

  async saveDraft(userId: string, space: string = 'SAF', data: Record<string, unknown>) {
    if (!VALID_SPACES.includes(space)) {
      throw new BadRequestException(`Invalid space: ${space}`);
    }
    return this.prisma.draftPost.create({
      data: {
        userId,
        space: space as ContentSpace,
        data: data as Prisma.InputJsonValue,
      },
    });
  }

  async updateDraft(draftId: string, userId: string, data: Record<string, unknown>) {
    const draft = await this.prisma.draftPost.findUnique({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.userId !== userId) throw new ForbiddenException();

    return this.prisma.draftPost.update({
      where: { id: draftId },
      data: { data: data as Prisma.InputJsonValue },
    });
  }

  async deleteDraft(draftId: string, userId: string) {
    const draft = await this.prisma.draftPost.findUnique({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.userId !== userId) throw new ForbiddenException();

    await this.prisma.draftPost.delete({ where: { id: draftId } });
    return { deleted: true };
  }

  async deleteAllDrafts(userId: string) {
    await this.prisma.draftPost.deleteMany({ where: { userId } });
    return { deleted: true };
  }

  /**
   * Publish a draft — creates the actual content (post/thread/reel/video)
   * from the draft data, then deletes the draft.
   *
   * The draft's `data` JSON must contain the fields expected by the target
   * content creation flow. This method extracts them and delegates to Prisma
   * directly (not via other services, to avoid circular deps).
   *
   * Returns the created content ID and type.
   */
  async publishDraft(draftId: string, userId: string): Promise<{ contentId: string; space: string }> {
    const draft = await this.prisma.draftPost.findUnique({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.userId !== userId) throw new ForbiddenException();

    const draftData = draft.data as Record<string, unknown>;
    let contentId: string;

    try {
      switch (draft.space) {
        case 'SAF': {
          const post = await this.prisma.post.create({
            data: {
              userId,
              content: (draftData.content as string) || '',
              postType: ((draftData.postType as string) || 'TEXT') as PostType,
              mediaUrls: (draftData.mediaUrls as string[]) || [],
              mediaTypes: (draftData.mediaTypes as string[]) || [],
              hashtags: (draftData.hashtags as string[]) || [],
              mentions: (draftData.mentions as string[]) || [],
              altText: (draftData.altText as string) || null,
              locationName: (draftData.locationName as string) || null,
            },
          });
          contentId = post.id;
          break;
        }
        case 'MAJLIS': {
          const thread = await this.prisma.thread.create({
            data: {
              userId,
              content: (draftData.content as string) || '',
              mediaUrls: (draftData.mediaUrls as string[]) || [],
              hashtags: (draftData.hashtags as string[]) || [],
              mentions: (draftData.mentions as string[]) || [],
              isChainHead: true,
            },
          });
          contentId = thread.id;
          break;
        }
        case 'BAKRA': {
          const reel = await this.prisma.reel.create({
            data: {
              userId,
              videoUrl: (draftData.videoUrl as string) || '',
              thumbnailUrl: (draftData.thumbnailUrl as string) || null,
              caption: (draftData.caption as string) || null,
              duration: (draftData.duration as number) || 0,
              hashtags: (draftData.hashtags as string[]) || [],
              mentions: (draftData.mentions as string[]) || [],
            },
          });
          contentId = reel.id;
          break;
        }
        case 'MINBAR': {
          const channelId = draftData.channelId as string;
          if (!channelId) {
            throw new BadRequestException('MINBAR drafts require a channelId');
          }
          const video = await this.prisma.video.create({
            data: {
              userId,
              channelId,
              title: (draftData.title as string) || 'Untitled',
              description: (draftData.description as string) || null,
              videoUrl: (draftData.videoUrl as string) || '',
              thumbnailUrl: (draftData.thumbnailUrl as string) || null,
              duration: (draftData.duration as number) || 0,
              category: ((draftData.category as string) || 'OTHER') as VideoCategory,
              status: 'PUBLISHED',
            },
          });
          contentId = video.id;
          break;
        }
        default:
          throw new BadRequestException(`Unsupported draft space: ${draft.space}`);
      }
    } catch (error) {
      this.logger.error(`Failed to publish draft ${draftId}: ${error instanceof Error ? error.message : error}`);
      throw new BadRequestException('Failed to publish draft — content creation failed');
    }

    // Delete the draft after successful creation
    await this.prisma.draftPost.delete({ where: { id: draftId } });

    this.logger.log(`Draft ${draftId} published as ${draft.space} content ${contentId}`);
    return { contentId, space: draft.space };
  }
}