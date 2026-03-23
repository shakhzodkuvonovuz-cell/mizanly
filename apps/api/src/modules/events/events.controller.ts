import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, IsBoolean, IsDateString, IsUrl, MaxLength, IsEnum, IsISO8601 } from 'class-validator';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EventsService } from './events.service';

export class CreateEventDto {
  @ApiProperty({ description: 'Event title', maxLength: 200, required: true })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Event description', maxLength: 5000, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ description: 'Cover image URL', required: false })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  @ApiProperty({ description: 'Start date and time (ISO 8601)', required: true })
  @IsISO8601()
  startDate: string;

  @ApiProperty({ description: 'End date and time (ISO 8601)', required: false })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiProperty({ description: 'Physical location address', maxLength: 500, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @ApiProperty({ description: 'Location URL (e.g., Google Maps)', required: false })
  @IsOptional()
  @IsUrl()
  locationUrl?: string;

  @ApiProperty({ description: 'Whether the event is online', default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isOnline?: boolean = false;

  @ApiProperty({ description: 'Online event URL', required: false })
  @IsOptional()
  @IsUrl()
  onlineUrl?: string;

  @ApiProperty({ description: 'Event type', enum: ['IN_PERSON', 'ONLINE', 'HYBRID'], default: 'IN_PERSON', required: false })
  @IsOptional()
  @IsEnum(['IN_PERSON', 'ONLINE', 'HYBRID'])
  eventType?: string = 'IN_PERSON';

  @ApiProperty({ description: 'Privacy level', enum: ['EVENT_PUBLIC', 'EVENT_PRIVATE'], default: 'EVENT_PUBLIC', required: false })
  @IsOptional()
  @IsEnum(['EVENT_PUBLIC', 'EVENT_PRIVATE'])
  privacy?: string = 'EVENT_PUBLIC';

  @ApiProperty({ description: 'Community ID if event belongs to a community', required: false })
  @IsOptional()
  @IsString()
  communityId?: string;
}

export class UpdateEventDto {
  @ApiProperty({ description: 'Event title', maxLength: 200, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ description: 'Event description', maxLength: 5000, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ description: 'Cover image URL', required: false })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  @ApiProperty({ description: 'Start date and time (ISO 8601)', required: false })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiProperty({ description: 'End date and time (ISO 8601)', required: false })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiProperty({ description: 'Physical location address', maxLength: 500, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @ApiProperty({ description: 'Location URL (e.g., Google Maps)', required: false })
  @IsOptional()
  @IsUrl()
  locationUrl?: string;

  @ApiProperty({ description: 'Whether the event is online', required: false })
  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @ApiProperty({ description: 'Online event URL', required: false })
  @IsOptional()
  @IsUrl()
  onlineUrl?: string;

  @ApiProperty({ description: 'Event type', enum: ['in_person', 'online', 'hybrid'], required: false })
  @IsOptional()
  @IsEnum(['in_person', 'online', 'hybrid'])
  eventType?: string;

  @ApiProperty({ description: 'Privacy level', enum: ['public', 'private', 'community'], required: false })
  @IsOptional()
  @IsEnum(['public', 'private', 'community'])
  privacy?: string;

  @ApiProperty({ description: 'Community ID if event belongs to a community', required: false })
  @IsOptional()
  @IsString()
  communityId?: string;
}

export class RsvpDto {
  @ApiProperty({ description: 'RSVP status', enum: ['going', 'maybe', 'not_going'], required: true })
  @IsEnum(['going', 'maybe', 'not_going'])
  status: 'going' | 'maybe' | 'not_going';
}

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private service: EventsService) {}

  // POST /events
  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a new event' })
  @ApiCreatedResponse({ description: 'Event created' })
  createEvent(@CurrentUser('id') userId: string, @Body() dto: CreateEventDto) {
    return this.service.createEvent(userId, dto);
  }

  // GET /events
  @Get()
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'List events with cursor pagination' })
  @ApiOkResponse({ description: 'Paginated list of events' })
  listEvents(
    @CurrentUser('id') userId: string | null,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
    @Query('privacy') privacy?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.service.listEvents(userId, cursor, limit, privacy, eventType);
  }

  // Compound :id routes BEFORE simple :id route
  // POST /events/:id/rsvp
  @Post(':id/rsvp')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'RSVP to an event' })
  @ApiCreatedResponse({ description: 'RSVP created/updated' })
  rsvpToEvent(
    @CurrentUser('id') userId: string,
    @Param('id') eventId: string,
    @Body() dto: RsvpDto,
  ) {
    return this.service.rsvpToEvent(userId, eventId, dto.status);
  }

  // DELETE /events/:id/rsvp
  @Delete(':id/rsvp')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Remove RSVP' })
  @ApiNoContentResponse({ description: 'RSVP removed' })
  async removeRsvp(@CurrentUser('id') userId: string, @Param('id') eventId: string) {
    await this.service.removeRsvp(userId, eventId);
    return null;
  }

  // GET /events/:id/attendees
  @Get(':id/attendees')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'List attendees with pagination' })
  @ApiOkResponse({ description: 'Paginated list of attendees' })
  listAttendees(
    @Param('id') eventId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.service.listAttendees(eventId, cursor, limit, status);
  }

  // GET /events/:id — simple param route LAST
  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get event details' })
  @ApiOkResponse({ description: 'Event details' })
  getEvent(@CurrentUser('id') userId: string | null, @Param('id') id: string) {
    return this.service.getEvent(id, userId);
  }

  // PATCH /events/:id
  @Patch(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Update event (organizer only)' })
  @ApiOkResponse({ description: 'Event updated' })
  updateEvent(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.service.updateEvent(userId, id, dto);
  }

  // DELETE /events/:id
  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete event (organizer only)' })
  @ApiNoContentResponse({ description: 'Event deleted' })
  async deleteEvent(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.service.deleteEvent(userId, id);
    return null;
  }
}
