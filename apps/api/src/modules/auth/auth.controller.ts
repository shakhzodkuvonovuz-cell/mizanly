import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { SetInterestsDto } from './dto/set-interests.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete profile after Clerk signup' })
  register(
    @CurrentUser('clerkId') clerkId: string,
    @Body() dto: RegisterDto,
  ) {
    return this.authService.register(clerkId, dto);
  }

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  @Get('check-username')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Check if username is available' })
  checkUsername(@Query('username') username: string) {
    return this.authService.checkUsername(username);
  }

  @Post('interests')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set interest categories (onboarding)' })
  setInterests(
    @CurrentUser('id') userId: string,
    @Body() dto: SetInterestsDto,
  ) {
    return this.authService.setInterests(userId, dto);
  }

  @Get('suggested-users')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get suggested accounts to follow (onboarding)' })
  suggestedUsers(@CurrentUser('id') userId: string) {
    return this.authService.getSuggestedUsers(userId);
  }
}
