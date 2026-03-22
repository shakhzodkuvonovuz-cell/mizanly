import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, conversationId: string, title: string) {
    if (!title.trim()) throw new BadRequestException('Title is required');

    return this.prisma.messageChecklist.create({
      data: {
        conversationId,
        title: title.trim(),
        createdById: userId,
      },
      include: { items: true },
    });
  }

  async getByConversation(conversationId: string, userId?: string) {
    // Verify the user is a member of the conversation before exposing checklists
    if (userId) {
      const member = await this.prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!member) throw new ForbiddenException('Not a member of this conversation');
    }
    return this.prisma.messageChecklist.findMany({
      where: { conversationId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async addItem(userId: string, checklistId: string, text: string) {
    const checklist = await this.prisma.messageChecklist.findUnique({ where: { id: checklistId } });
    if (!checklist) throw new NotFoundException('Checklist not found');

    return this.prisma.messageChecklistItem.create({
      data: { checklistId, text: text.trim() },
    });
  }

  async toggleItem(userId: string, itemId: string) {
    const item = await this.prisma.messageChecklistItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item not found');

    return this.prisma.messageChecklistItem.update({
      where: { id: itemId },
      data: {
        isCompleted: !item.isCompleted,
        completedBy: !item.isCompleted ? userId : null,
      },
    });
  }

  async deleteItem(userId: string, itemId: string) {
    const item = await this.prisma.messageChecklistItem.findUnique({
      where: { id: itemId },
      include: { checklist: true },
    });
    if (!item) throw new NotFoundException('Item not found');

    await this.prisma.messageChecklistItem.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  async deleteChecklist(userId: string, checklistId: string) {
    const checklist = await this.prisma.messageChecklist.findUnique({ where: { id: checklistId } });
    if (!checklist) throw new NotFoundException('Checklist not found');
    if (checklist.createdById !== userId) throw new ForbiddenException('Only the creator can delete this checklist');

    await this.prisma.messageChecklist.delete({ where: { id: checklistId } });
    return { deleted: true };
  }
}
