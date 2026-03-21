import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsIn, ArrayMinSize, ArrayMaxSize, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { ThumbnailsService } from './thumbnails.service';

class TrackVariantDto {
  @ApiProperty() @IsString() @MaxLength(100) variantId: string;
}

class CreateVariantsDto {
  @ApiProperty()
  @IsString()
  @IsIn(['post', 'reel', 'video'])
  contentType!: string;

  @ApiProperty()
  @IsString()
  contentId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  thumbnailUrls!: string[];
}

@ApiTags('Thumbnail A/B Testing')
@Controller('thumbnails')
export class ThumbnailsController {
  constructor(private thumbnails: ThumbnailsService) {}

  @Post('variants')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload thumbnail variants for A/B testing (2-3 variants)' })
  async createVariants(@Body() dto: CreateVariantsDto) {
    return this.thumbnails.createVariants(
      dto.contentType as 'post' | 'reel' | 'video',
      dto.contentId,
      dto.thumbnailUrls,
    );
  }

  @Get('variants/:contentType/:contentId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get variants with stats (creator analytics)' })
  async getVariants(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
  ) {
    return this.thumbnails.getVariants(contentType as 'post' | 'reel' | 'video', contentId);
  }

  @Get('serve/:contentType/:contentId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get thumbnail to display (random if testing, winner if declared)' })
  async serve(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
  ) {
    const url = await this.thumbnails.serveThumbnail(contentType as 'post' | 'reel' | 'video', contentId);
    return { thumbnailUrl: url };
  }

  @Post('impression')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 100 } })
  @ApiOperation({ summary: 'Track impression for a thumbnail variant' })
  async trackImpression(@Body() body: TrackVariantDto) {
    return this.thumbnails.trackImpression(body.variantId);
  }

  @Post('click')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 100 } })
  @ApiOperation({ summary: 'Track click for a thumbnail variant' })
  async trackClick(@Body() body: TrackVariantDto) {
    return this.thumbnails.trackClick(body.variantId);
  }
}
