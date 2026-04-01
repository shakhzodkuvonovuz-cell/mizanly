import { Module, Global } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { MeilisearchService } from './meilisearch.service';

@Global()
@Module({
  controllers: [SearchController],
  providers: [SearchService, MeilisearchService],
  exports: [SearchService, MeilisearchService],
})
export class SearchModule {}
