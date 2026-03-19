import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class CommunityNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async createNote(authorId: string, contentType: string, contentId: string, note: string) {
    const validTypes = ['post', 'thread', 'reel'];
    if (!validTypes.includes(contentType)) {
      throw new BadRequestException(`contentType must be one of: ${validTypes.join(', ')}`);
    }

    return this.prisma.communityNote.create({
      data: { contentType, contentId, authorId, note },
    });
  }

  async getNotesForContent(contentType: string, contentId: string) {
    return this.prisma.communityNote.findMany({
      where: { contentType, contentId },
      orderBy: { helpfulVotes: 'desc' },
      take: 10,
    });
  }

  async rateNote(userId: string, noteId: string, rating: string) {
    const validRatings = ['helpful', 'somewhat_helpful', 'not_helpful'];
    if (!validRatings.includes(rating)) {
      throw new BadRequestException(`Rating must be one of: ${validRatings.join(', ')}`);
    }

    const note = await this.prisma.communityNote.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Note not found');

    // Check for existing rating
    const existing = await this.prisma.communityNoteRating.findUnique({
      where: { noteId_userId: { noteId, userId } },
    });
    if (existing) throw new ConflictException('Already rated this note');

    await this.prisma.communityNoteRating.create({
      data: { noteId, userId, rating },
    });

    // Update vote counts
    const incrementField = rating === 'not_helpful' ? 'notHelpfulVotes' : 'helpfulVotes';
    const updated = await this.prisma.communityNote.update({
      where: { id: noteId },
      data: { [incrementField]: { increment: 1 } },
    });

    // Auto-promote or dismiss based on voting threshold
    const totalVotes = updated.helpfulVotes + updated.notHelpfulVotes;
    if (totalVotes >= 5) {
      const helpfulRatio = updated.helpfulVotes / totalVotes;
      const newStatus = helpfulRatio >= 0.6 ? 'helpful' : 'not_helpful';
      await this.prisma.communityNote.update({
        where: { id: noteId },
        data: { status: newStatus },
      });
    }

    return { rated: true };
  }

  async getHelpfulNotes(contentType: string, contentId: string) {
    return this.prisma.communityNote.findMany({
      where: { contentType, contentId, status: 'helpful' },
      orderBy: { helpfulVotes: 'desc' },
      take: 3,
    });
  }
}
