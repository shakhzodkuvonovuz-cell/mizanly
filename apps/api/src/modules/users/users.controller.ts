import { Controller, Get, Put, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get(':username')
  getProfile(@Param('username') username: string, @Query('currentUserId') currentUserId?: string) {
    return this.usersService.getProfile(username, currentUserId);
  }

  @Put('profile')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Post(':id/follow')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  follow(@CurrentUser('id') currentUserId: string, @Param('id') targetId: string) {
    return this.usersService.follow(currentUserId, targetId);
  }

  @Delete(':id/follow')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  unfollow(@CurrentUser('id') currentUserId: string, @Param('id') targetId: string) {
    return this.usersService.unfollow(currentUserId, targetId);
  }

  @Get(':id/followers')
  getFollowers(@Param('id') userId: string, @Query('cursor') cursor?: string) {
    return this.usersService.getFollowers(userId, cursor);
  }

  @Get(':id/following')
  getFollowing(@Param('id') userId: string, @Query('cursor') cursor?: string) {
    return this.usersService.getFollowing(userId, cursor);
  }
}
