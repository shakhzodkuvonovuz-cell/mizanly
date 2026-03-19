import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { EmbeddingsService } from './embeddings.service';
import { EmbeddingPipelineService } from './embedding-pipeline.service';
import { EmbeddingsController } from './embeddings.controller';

@Module({
  imports: [PrismaModule],
  controllers: [EmbeddingsController],
  providers: [EmbeddingsService, EmbeddingPipelineService],
  exports: [EmbeddingsService, EmbeddingPipelineService],
})
export class EmbeddingsModule {}
