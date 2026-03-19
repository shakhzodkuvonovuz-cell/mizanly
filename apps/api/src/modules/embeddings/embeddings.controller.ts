import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { EmbeddingPipelineService } from './embedding-pipeline.service';

@ApiTags('Embeddings')
@Controller('api/v1/embeddings')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@Throttle({ default: { ttl: 60000, limit: 5 } })
export class EmbeddingsController {
  constructor(private pipeline: EmbeddingPipelineService) {}

  @Post('backfill')
  @ApiOperation({ summary: 'Trigger embedding backfill for all content (admin)' })
  async backfill() {
    // In production, this should be restricted to admin users
    const result = await this.pipeline.backfillAll();
    return { data: result, success: true };
  }
}
