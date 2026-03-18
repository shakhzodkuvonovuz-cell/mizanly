import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateEventDto, UpdateEventDto } from './events.controller';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  constructor(private prisma: PrismaService) {}

  async createEvent(userId: string, dto: CreateEventDto) {
    const data: Prisma.EventCreateInput = {
      title: dto.title,
      description: dto.description,
      coverUrl: dto.coverUrl,
      startDate: dto.startDate,
      endDate: dto.endDate,
      location: dto.location,
      locationUrl: dto.locationUrl,
      isOnline: dto.isOnline ?? false,
      onlineUrl: dto.onlineUrl,
      eventType: dto.eventType ?? 'in_person',
      privacy: dto.privacy ?? 'public',
      user: { connect: { id: userId } },
    };
    if (dto.communityId) {
      data.communityId = dto.communityId;
    }

    const event = await this.prisma.event.create({
      data,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
        _count: {
          select: {
            rsvps: true,
          },
        },
      },
    });

    // New event — all counts are 0
    return {
      ...event,
      goingCount: 0,
      maybeCount: 0,
      notGoingCount: 0,
    };
  }

  async listEvents(
    userId: string | null,
    cursor?: string,
    limit = 20,
    privacy?: string,
    eventType?: string,
  ) {
    const where: Prisma.EventWhereInput = {};

    // Privacy filter
    if (privacy) {
      where.privacy = privacy;
    } else {
      // If no user, only public events
      if (!userId) {
        where.privacy = 'public';
      }
    }

    if (eventType) {
      where.eventType = eventType;
    }

    const events = await this.prisma.event.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
        _count: {
          select: {
            rsvps: true,
          },
        },
      },
      take: limit + 1,
      orderBy: { startDate: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;

    // Batch-fetch RSVP counts per status for all events in one go
    const eventIds = items.map(e => e.id);
    const rsvpCounts = await this.prisma.eventRSVP.groupBy({
      by: ['eventId', 'status'],
      where: { eventId: { in: eventIds } },
      _count: { id: true },
    });

    const countsMap = new Map<string, { going: number; maybe: number; not_going: number }>();
    for (const row of rsvpCounts) {
      if (!countsMap.has(row.eventId)) {
        countsMap.set(row.eventId, { going: 0, maybe: 0, not_going: 0 });
      }
      const entry = countsMap.get(row.eventId)!;
      if (row.status === 'going') entry.going = row._count.id;
      else if (row.status === 'maybe') entry.maybe = row._count.id;
      else if (row.status === 'not_going') entry.not_going = row._count.id;
    }

    const itemsWithCounts = items.map(event => {
      const counts = countsMap.get(event.id) ?? { going: 0, maybe: 0, not_going: 0 };
      return {
        ...event,
        goingCount: counts.going,
        maybeCount: counts.maybe,
        notGoingCount: counts.not_going,
      };
    });

    return {
      data: itemsWithCounts,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  async getEvent(id: string, userId: string | null) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
        _count: {
          select: {
            rsvps: true,
          },
        },
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check privacy: if private and user not owner, not allowed
    if (event.privacy === 'private' && event.userId !== userId) {
      throw new ForbiddenException('You do not have permission to view this event');
    }

    const goingCount = await this.prisma.eventRSVP.count({
      where: { eventId: event.id, status: 'going' },
    });
    const maybeCount = await this.prisma.eventRSVP.count({
      where: { eventId: event.id, status: 'maybe' },
    });
    const notGoingCount = await this.prisma.eventRSVP.count({
      where: { eventId: event.id, status: 'not_going' },
    });

    // Get user's RSVP status if logged in
    let userRsvp = null;
    if (userId) {
      userRsvp = await this.prisma.eventRSVP.findUnique({
        where: { eventId_userId: { eventId: event.id, userId } },
        select: { status: true },
      });
    }

    return {
      ...event,
      goingCount,
      maybeCount,
      notGoingCount,
      userRsvp: userRsvp?.status ?? null,
    };
  }

  async updateEvent(userId: string, id: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.userId !== userId) {
      throw new ForbiddenException('Only the organizer can edit this event');
    }

    const data: Prisma.EventUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl;
    if (dto.startDate !== undefined) data.startDate = dto.startDate;
    if (dto.endDate !== undefined) data.endDate = dto.endDate;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.locationUrl !== undefined) data.locationUrl = dto.locationUrl;
    if (dto.isOnline !== undefined) data.isOnline = dto.isOnline;
    if (dto.onlineUrl !== undefined) data.onlineUrl = dto.onlineUrl;
    if (dto.eventType !== undefined) data.eventType = dto.eventType;
    if (dto.privacy !== undefined) data.privacy = dto.privacy;
    if (dto.communityId !== undefined) {
      data.communityId = dto.communityId;
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
        _count: {
          select: {
            rsvps: true,
          },
        },
      },
    });

    // Add counts
    const goingCount = await this.prisma.eventRSVP.count({
      where: { eventId: updated.id, status: 'going' },
    });
    const maybeCount = await this.prisma.eventRSVP.count({
      where: { eventId: updated.id, status: 'maybe' },
    });
    const notGoingCount = await this.prisma.eventRSVP.count({
      where: { eventId: updated.id, status: 'not_going' },
    });

    return {
      ...updated,
      goingCount,
      maybeCount,
      notGoingCount,
    };
  }

  async deleteEvent(userId: string, id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.userId !== userId) {
      throw new ForbiddenException('Only the organizer can delete this event');
    }

    await this.prisma.event.delete({ where: { id } });
    return { success: true };
  }

  async rsvpToEvent(userId: string, eventId: string, status: 'going' | 'maybe' | 'not_going') {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, privacy: true, userId: true, startDate: true, endDate: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Block RSVP to past events
    const now = new Date();
    const eventEnd = event.endDate ? new Date(event.endDate) : new Date(event.startDate);
    if (eventEnd < now) {
      throw new BadRequestException('Cannot RSVP to a past event');
    }

    // If private event, only owner and possibly invited users can RSVP
    if (event.privacy === 'private' && event.userId !== userId) {
      throw new ForbiddenException('You are not invited to this private event');
    }

    // Upsert handles idempotency — no race condition between find and create
    try {
      const rsvp = await this.prisma.eventRSVP.upsert({
        where: { eventId_userId: { eventId, userId } },
        update: { status },
        create: { eventId, userId, status },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isVerified: true,
            },
          },
        },
      });
      return rsvp;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Concurrent duplicate — retry as update
        return this.prisma.eventRSVP.update({
          where: { eventId_userId: { eventId, userId } },
          data: { status },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                isVerified: true,
              },
            },
          },
        });
      }
      throw error;
    }
  }

  async removeRsvp(userId: string, eventId: string) {
    try {
      await this.prisma.eventRSVP.delete({
        where: { eventId_userId: { eventId, userId } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('RSVP not found');
      }
      throw error;
    }
    return { success: true };
  }

  async listAttendees(eventId: string, cursor?: string, limit = 20, status?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const where: Prisma.EventRSVPWhereInput = { eventId };
    if (status) {
      where.status = status;
    }

    const rsvps = await this.prisma.eventRSVP.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rsvps.length > limit;
    const items = hasMore ? rsvps.slice(0, limit) : rsvps;

    return {
      data: items,
      meta: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }
}
