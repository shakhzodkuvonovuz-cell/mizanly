import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { EmbeddingPipelineService } from './embedding-pipeline.service';
import { EmbeddingsController } from './embeddings.controller';

@Module({
  controllers: [EmbeddingsController],
  providers: [EmbeddingsService, EmbeddingPipelineService],
  exports: [EmbeddingsService, EmbeddingPipelineService],
})
export class EmbeddingsModule {}
