import { Module } from '@nestjs/common';
import { MosquesController } from './mosques.controller';
import { MosquesService } from './mosques.service';

@Module({
  controllers: [MosquesController],
  providers: [MosquesService],
})
export class MosquesModule {}
