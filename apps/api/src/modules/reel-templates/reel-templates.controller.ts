import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsNumber, MaxLength, ValidateNested, ArrayMinSize, ArrayMaxSize, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ReelTemplatesService } from './reel-templates.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class TemplateSegmentDto {
  @IsNumber() @Min(0) @Max(600000) startMs: number;
  @IsNumber() @Min(0) @Max(600000) endMs: number;
  @IsOptional() @IsString() @MaxLength(500) text?: string;
}

class CreateReelTemplateDto {
  @IsString() @MaxLength(50) sourceReelId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => TemplateSegmentDto) segments: TemplateSegmentDto[];
  @IsString() @MaxLength(200) name: string;
}

@ApiTags('Reel Templates (Bakra)')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('reel-templates')
export class ReelTemplatesController {
  constructor(private reelTemplatesService: ReelTemplatesService) {}

  @Get()
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse reel templates' })
  browse(
    @Query('cursor') cursor?: string,
    @Query('trending') trending?: string,
  ) {
    return this.reelTemplatesService.browse(
      cursor,
      20,
      trending === 'true',
    );
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get reel template by ID' })
  getById(@Param('id') id: string) {
    return this.reelTemplatesService.getById(id);
  }

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a reel template' })
  create(
    @CurrentUser('id') userId: string,
    @Body() body: CreateReelTemplateDto,
  ) {
    return this.reelTemplatesService.create(userId, body);
  }

  @Post(':id/use')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a reel template as used' })
  markUsed(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelTemplatesService.markUsed(id, userId);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a reel template' })
  delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelTemplatesService.delete(id, userId);
  }
}
