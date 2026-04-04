import { Controller, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingPipelineService } from './embedding-pipeline.service';

@ApiTags('Embeddings')
@Controller('embeddings')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@Throttle({ default: { ttl: 60000, limit: 5 } })
export class EmbeddingsController {
  constructor(
    private pipeline: EmbeddingPipelineService,
    private prisma: PrismaService,
  ) {}

  @Post('backfill')
  @ApiOperation({ summary: 'Trigger embedding backfill for all content (admin only)' })
  async backfill(@CurrentUser('id') userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
    const result = await this.pipeline.backfillAll();
    return result;
  }
}
