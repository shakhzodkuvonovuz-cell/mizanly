import { Controller } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('reels')
@ApiBearerAuth()
@Controller('reels')
export class ReelsController {}