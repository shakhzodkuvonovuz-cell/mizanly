import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StickersService } from './stickers.service';
import { CreateStickerPackDto } from './dto/create-pack.dto';

class GenerateStickerDto {
  @ApiProperty({ description: 'Text prompt describing the sticker' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  prompt!: string;

  @ApiProperty({ description: 'Sticker art style', required: false })
  @IsOptional()
  @IsString()
  @IsIn(['cartoon', 'calligraphy', 'emoji', 'geometric', 'kawaii'])
  style?: 'cartoon' | 'calligraphy' | 'emoji' | 'geometric' | 'kawaii';
}

@ApiTags('Stickers')
@Controller('stickers')
export class StickersController {
  constructor(private stickers: StickersService) {}

  @Post('packs')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Create sticker pack' })
  async createPack(@CurrentUser('id') userId: string, @Body() dto: CreateStickerPackDto) {
    return this.stickers.createPack(dto, userId);
  }

  @Get('packs')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse sticker packs' })
  async browse(@Query('cursor') cursor?: string) {
    return this.stickers.browsePacks(cursor);
  }

  @Get('packs/featured')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get featured packs' })
  async featured() {
    return this.stickers.getFeaturedPacks();
  }

  @Get('packs/search')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Search sticker packs' })
  async search(@Query('q') query: string) {
    return this.stickers.searchPacks(query);
  }

  @Get('packs/:id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get pack with stickers' })
  async getPack(@Param('id') id: string) {
    return this.stickers.getPack(id);
  }

  @Delete('packs/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete pack (admin or owner)' })
  async deletePack(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.stickers.deletePack(id, userId);
  }

  @Get('my')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my sticker packs' })
  async myPacks(@CurrentUser('id') userId: string) {
    return this.stickers.getMyPacks(userId);
  }

  @Get('my/recent')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recently used stickers' })
  async recent(@CurrentUser('id') userId: string) {
    return this.stickers.getRecentStickers(userId);
  }

  @Post('my/:packId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add pack to collection' })
  async addPack(@CurrentUser('id') userId: string, @Param('packId') packId: string) {
    return this.stickers.addToCollection(userId, packId);
  }

  @Delete('my/:packId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove pack from collection' })
  async removePack(@CurrentUser('id') userId: string, @Param('packId') packId: string) {
    return this.stickers.removeFromCollection(userId, packId);
  }

  // ── AI Sticker Generation ───────────────────────────────

  @Post('generate')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 86400000, limit: 10 } })
  @ApiOperation({ summary: 'Generate an AI sticker from a text prompt (10/day limit)' })
  async generate(
    @CurrentUser('id') userId: string,
    @Body() dto: GenerateStickerDto,
  ) {
    return this.stickers.generateSticker(userId, dto.prompt, dto.style);
  }

  @Post('save/:stickerId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save a generated sticker to My Stickers' })
  async saveGenerated(
    @CurrentUser('id') userId: string,
    @Param('stickerId') stickerId: string,
  ) {
    return this.stickers.saveGeneratedSticker(userId, stickerId);
  }

  @Get('generated')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my generated stickers' })
  async myGenerated(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.stickers.getMyGeneratedStickers(userId, cursor);
  }

  @Get('islamic-presets')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get Islamic preset stickers' })
  async islamicPresets() {
    return this.stickers.getIslamicPresetStickers();
  }
}