import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StickersService } from './stickers.service';
import { CreateStickerPackDto } from './dto/create-pack.dto';

@ApiTags('Stickers')
@Controller('stickers')
export class StickersController {
  constructor(private stickers: StickersService) {}

  @Post('packs')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create sticker pack' })
  async createPack(@Body() dto: CreateStickerPackDto) {
    return this.stickers.createPack(dto);
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
  @ApiOperation({ summary: 'Delete pack (admin)' })
  async deletePack(@Param('id') id: string) {
    return this.stickers.deletePack(id);
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
}