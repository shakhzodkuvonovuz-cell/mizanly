import { EmbeddingContentType, NoteRating, CommunityNoteStatus } from '@prisma/client';
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

    // Verify content exists and is not removed
    let contentExists = false;
    if (contentType === 'post') {
      contentExists = !!(await this.prisma.post.findFirst({ where: { id: contentId, isRemoved: false }, select: { id: true } }));
    } else if (contentType === 'thread') {
      contentExists = !!(await this.prisma.thread.findFirst({ where: { id: contentId, isRemoved: false }, select: { id: true } }));
    } else if (contentType === 'reel') {
      contentExists = !!(await this.prisma.reel.findFirst({ where: { id: contentId, isRemoved: false }, select: { id: true } }));
    }
    if (!contentExists) throw new NotFoundException('Content not found');

    return this.prisma.communityNote.create({
      data: { contentType: contentType as EmbeddingContentType, contentId, authorId, note },
    });
  }

  async getNotesForContent(contentType: string, contentId: string) {
    const validTypes = ['post', 'thread', 'reel'];
    if (!validTypes.includes(contentType)) {
      throw new BadRequestException(`contentType must be one of: ${validTypes.join(', ')}`);
    }
    return this.prisma.communityNote.findMany({
      where: { contentType: contentType as EmbeddingContentType, contentId, status: { in: [CommunityNoteStatus.HELPFUL, CommunityNoteStatus.PROPOSED] } },
      orderBy: { helpfulVotes: 'desc' },
      take: 10,
    });
  }

  async rateNote(userId: string, noteId: string, rating: string) {
    const validRatings = ['NOTE_HELPFUL', 'NOTE_SOMEWHAT_HELPFUL', 'NOTE_NOT_HELPFUL'];
    if (!validRatings.includes(rating)) {
      throw new BadRequestException(`Rating must be one of: ${validRatings.join(', ')}`);
    }

    const note = await this.prisma.communityNote.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Note not found');

    // Prevent self-rating
    if (note.authorId === userId) throw new BadRequestException('Cannot rate your own note');

    // Check for existing rating
    const existing = await this.prisma.communityNoteRating.findUnique({
      where: { noteId_userId: { noteId, userId } },
    });
    if (existing) throw new ConflictException('Already rated this note');

    // Use $transaction to atomically create rating + update vote counts + auto-promote
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.communityNoteRating.create({
        data: { noteId, userId, rating: rating as NoteRating },
      });

      // Only fully 'helpful' ratings count toward helpfulVotes; 'somewhat_helpful' is neutral
      const incrementField = rating === 'NOTE_HELPFUL' ? 'helpfulVotes' : rating === 'NOTE_NOT_HELPFUL' ? 'notHelpfulVotes' : null;
      const noteData = incrementField
        ? await tx.communityNote.update({
            where: { id: noteId },
            data: { [incrementField]: { increment: 1 } },
          })
        : await tx.communityNote.findUnique({ where: { id: noteId } });

      if (!noteData) return null;

      // Auto-promote or dismiss based on voting threshold
      const totalVotes = noteData.helpfulVotes + noteData.notHelpfulVotes;
      if (totalVotes >= 5) {
        const helpfulRatio = noteData.helpfulVotes / totalVotes;
        const newStatus = helpfulRatio >= 0.6 ? CommunityNoteStatus.HELPFUL : CommunityNoteStatus.NOT_HELPFUL;
        await tx.communityNote.update({
          where: { id: noteId },
          data: { status: newStatus },
        });
      }

      return noteData;
    });

    return { rated: true };
  }

  async getHelpfulNotes(contentType: string, contentId: string) {
    const validTypes = ['post', 'thread', 'reel'];
    if (!validTypes.includes(contentType)) {
      throw new BadRequestException(`contentType must be one of: ${validTypes.join(', ')}`);
    }
    return this.prisma.communityNote.findMany({
      where: { contentType: contentType as EmbeddingContentType, contentId, status: CommunityNoteStatus.HELPFUL },
      orderBy: { helpfulVotes: 'desc' },
      take: 3,
    });
  }
}
