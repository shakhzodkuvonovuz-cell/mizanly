import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { ProfileLinksService } from './profile-links.service';
import { CreateProfileLinkDto } from './dto/create-profile-link.dto';
import { UpdateProfileLinkDto } from './dto/update-profile-link.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class ReorderLinksDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

@ApiTags('Profile Links')
@Controller('profile-links')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class ProfileLinksController {
  constructor(private profileLinksService: ProfileLinksService) {}

  @Get()
  @ApiOperation({ summary: 'Get own links (ordered by position)' })
  getLinks(@CurrentUser('id') userId: string) {
    return this.profileLinksService.getLinks(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a link (max 5 per user)' })
  addLink(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProfileLinkDto,
  ) {
    return this.profileLinksService.addLink(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update link title/url' })
  updateLink(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProfileLinkDto,
  ) {
    return this.profileLinksService.updateLink(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a link' })
  deleteLink(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.profileLinksService.deleteLink(userId, id);
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Reorder links (pass ordered array of IDs)' })
  reorder(@CurrentUser('id') userId: string, @Body() dto: ReorderLinksDto) {
    return this.profileLinksService.reorder(userId, dto.ids);
  }
}
