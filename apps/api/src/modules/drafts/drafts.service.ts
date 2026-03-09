import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ContentSpace } from '@prisma/client';

@Injectable()
export class DraftsService {
  constructor(private prisma: PrismaService) {}

  async getDrafts(userId: string, space?: string) {
    const where: Record<string, unknown> = { userId };
    if (space) where.space = space as ContentSpace;

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
    return this.prisma.draftPost.create({
      data: {
        userId,
        space: space as ContentSpace,
        data: data as object,
      },
    });
  }

  async updateDraft(draftId: string, userId: string, data: Record<string, unknown>) {
    const draft = await this.prisma.draftPost.findUnique({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.userId !== userId) throw new ForbiddenException();

    return this.prisma.draftPost.update({
      where: { id: draftId },
      data: { data: data as object },
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
}