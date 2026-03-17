import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

interface TemplateSegment {
  startMs: number;
  endMs: number;
  text?: string;
}

interface CreateReelTemplateInput {
  sourceReelId: string;
  segments: TemplateSegment[];
  name: string;
}

@Injectable()
export class ReelTemplatesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateReelTemplateInput) {
    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestException('Template name is required');
    }
    if (!data.segments || data.segments.length === 0) {
      throw new BadRequestException('At least one segment is required');
    }
    for (const segment of data.segments) {
      if (segment.startMs >= segment.endMs) {
        throw new BadRequestException(
          'Each segment startMs must be less than endMs',
        );
      }
    }

    return this.prisma.reelTemplate.create({
      data: {
        userId,
        name: data.name.trim(),
        sourceReelId: data.sourceReelId,
        segments: JSON.parse(JSON.stringify(data.segments)),
      },
    });
  }

  async browse(cursor?: string, limit = 20, trending = false) {
    const take = Math.min(limit, 50);

    const templates = await this.prisma.reelTemplate.findMany({
      where: cursor ? { id: { lt: cursor } } : undefined,
      orderBy: trending
        ? { useCount: 'desc' }
        : { createdAt: 'desc' },
      take: take + 1,
    });

    const hasMore = templates.length > take;
    const data = hasMore ? templates.slice(0, take) : templates;

    return {
      data,
      meta: {
        cursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }

  async getById(id: string) {
    const template = await this.prisma.reelTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('Reel template not found');
    }
    return template;
  }

  async markUsed(id: string, _userId: string) {
    const template = await this.prisma.reelTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('Reel template not found');
    }

    return this.prisma.reelTemplate.update({
      where: { id },
      data: { useCount: { increment: 1 } },
    });
  }

  async delete(id: string, userId: string) {
    const template = await this.prisma.reelTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('Reel template not found');
    }
    if (template.userId !== userId) {
      throw new ForbiddenException('Only the template owner can delete it');
    }

    await this.prisma.reelTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}
