import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { FatwaTopicType, IslamicEventType, ReputationTier, ScholarTopicType, MadhhabType, VolunteerCategory, MentorshipStatus, FatwaStatus, ScholarVerificationStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { ContentSafetyService } from '../moderation/content-safety.service';
import { sanitizeText } from '@/common/utils/sanitize';

const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true };

@Injectable()
export class CommunityService {
  private readonly logger = new Logger(CommunityService.name);
  constructor(
    private prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly contentSafety: ContentSafetyService,
  ) {}

  /** Sanitize + moderate text before persisting community content */
  private async moderateContent(...texts: (string | undefined)[]) {
    const filtered = texts.filter(Boolean) as string[];
    if (filtered.length === 0) return;
    const combined = filtered.join('\n');
    const sanitized = sanitizeText(combined);
    const result = await this.contentSafety.moderateText(sanitized);
    if (!result.safe) {
      throw new BadRequestException(`Content flagged: ${result.flags.join(', ')}`);
    }
  }

  // ── Local Boards ────────────────────────────────────────

  async createBoard(userId: string, dto: { name: string; description?: string; city: string; country: string; lat?: number; lng?: number }) {
    await this.moderateContent(dto.name, dto.description);
    return this.prisma.localBoard.create({ data: { createdById: userId, name: sanitizeText(dto.name), description: dto.description ? sanitizeText(dto.description) : dto.description, city: dto.city, country: dto.country, lat: dto.lat, lng: dto.lng } });
  }

  async getBoards(city?: string, country?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = {
      creator: { isBanned: false, isDeactivated: false, isDeleted: false },
    };
    if (city) where.city = city;
    if (country) where.country = country;

    const boards = await this.prisma.localBoard.findMany({
      where, orderBy: { membersCount: 'desc' }, take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { creator: { select: USER_SELECT } },
    });
    const hasMore = boards.length > limit;
    if (hasMore) boards.pop();
    return { data: boards, meta: { cursor: boards[boards.length - 1]?.id || null, hasMore } };
  }

  // ── Mentorship ──────────────────────────────────────────

  async requestMentorship(menteeId: string, dto: { mentorId: string; topic: string; notes?: string }) {
    if (menteeId === dto.mentorId) throw new BadRequestException('Cannot mentor yourself');

    // Check if mentor user exists
    const mentor = await this.prisma.user.findUnique({ where: { id: dto.mentorId }, select: { id: true } });
    if (!mentor) throw new NotFoundException('Mentor not found');

    try {
      const mentorship = await this.prisma.mentorship.create({
        data: { menteeId, mentorId: dto.mentorId, topic: dto.topic as FatwaTopicType, notes: dto.notes },
      });

      // Notify the mentor about the new mentorship request
      this.notificationsService.create({
        userId: dto.mentorId,
        actorId: menteeId,
        type: 'SYSTEM',
        title: 'Mentorship request',
        body: `You have a new mentorship request for "${dto.topic}"`,
      }).catch(err => this.logger.warn('Mentorship notification failed', err.message));

      return mentorship;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Mentorship request already exists');
      }
      throw e;
    }
  }

  async respondMentorship(mentorId: string, menteeId: string, accept: boolean) {
    const m = await this.prisma.mentorship.findUnique({ where: { mentorId_menteeId: { mentorId, menteeId } } });
    if (!m) throw new NotFoundException('Mentorship request not found');
    if (m.status !== MentorshipStatus.MENTORSHIP_PENDING) throw new BadRequestException('Mentorship request is no longer pending');
    return this.prisma.mentorship.update({
      where: { mentorId_menteeId: { mentorId, menteeId } },
      data: { status: accept ? MentorshipStatus.MENTORSHIP_ACTIVE : MentorshipStatus.MENTORSHIP_CANCELLED, startedAt: accept ? new Date() : undefined },
    });
  }

  async getMyMentorships(userId: string) {
    const [asMentor, asMentee] = await Promise.all([
      this.prisma.mentorship.findMany({ where: { mentorId: userId }, include: { mentee: { select: USER_SELECT } },
      take: 50,
    }),
      this.prisma.mentorship.findMany({ where: { menteeId: userId }, include: { mentor: { select: USER_SELECT } },
      take: 50,
    }),
    ]);
    return { asMentor, asMentee };
  }

  // ── Study Circles ───────────────────────────────────────

  async createStudyCircle(userId: string, dto: { title: string; description?: string; topic: string; schedule?: string; isOnline?: boolean; maxMembers?: number }) {
    await this.moderateContent(dto.title, dto.description);
    return this.prisma.studyCircle.create({ data: { leaderId: userId, ...dto, title: sanitizeText(dto.title), description: dto.description ? sanitizeText(dto.description) : dto.description, topic: dto.topic as ScholarTopicType } });
  }

  async getStudyCircles(topic?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = {
      isActive: true,
      leader: { isBanned: false, isDeactivated: false, isDeleted: false },
    };
    if (topic) where.topic = topic;

    const circles = await this.prisma.studyCircle.findMany({
      where, orderBy: { membersCount: 'desc' }, take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { leader: { select: USER_SELECT } },
    });
    const hasMore = circles.length > limit;
    if (hasMore) circles.pop();
    return { data: circles, meta: { cursor: circles[circles.length - 1]?.id || null, hasMore } };
  }

  // ── Fatwa Q&A ───────────────────────────────────────────

  async askFatwa(userId: string, dto: { question: string; madhab?: string; language?: string }) {
    await this.moderateContent(dto.question);
    return this.prisma.fatwaQuestion.create({
      data: { askerId: userId, question: sanitizeText(dto.question), madhab: dto.madhab as MadhhabType | undefined, language: dto.language },
    });
  }

  async getFatwaQuestions(status?: string, madhab?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = {
      asker: { isBanned: false, isDeactivated: false, isDeleted: false },
    };
    if (status) where.status = status;
    if (madhab) where.madhab = madhab;

    const questions = await this.prisma.fatwaQuestion.findMany({
      where, orderBy: { createdAt: 'desc' }, take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { asker: { select: USER_SELECT } },
    });
    const hasMore = questions.length > limit;
    if (hasMore) questions.pop();
    return { data: questions, meta: { cursor: questions[questions.length - 1]?.id || null, hasMore } };
  }

  async answerFatwa(scholarId: string, questionId: string, answer: string) {
    // Verify the user is an approved scholar
    const verification = await this.prisma.scholarVerification.findFirst({
      where: { userId: scholarId, status: ScholarVerificationStatus.VERIFICATION_APPROVED },
    });
    if (!verification) throw new ForbiddenException('Only verified scholars can answer fatwa questions');

    const q = await this.prisma.fatwaQuestion.findUnique({ where: { id: questionId } });
    if (!q) throw new NotFoundException('Fatwa question not found');
    if (q.status === FatwaStatus.FATWA_ANSWERED) throw new ConflictException('Question already answered');

    // Create an answer entry using self-referential design:
    // answerId is a FK to another FatwaQuestion, not a text field.
    // Store the answer text in a child FatwaQuestion record.
    const answerEntry = await this.prisma.fatwaQuestion.create({
      data: {
        askerId: scholarId,
        question: answer,
        status: FatwaStatus.FATWA_ANSWERED,
      },
    });

    const updated = await this.prisma.fatwaQuestion.update({
      where: { id: questionId },
      data: { status: FatwaStatus.FATWA_ANSWERED, answerId: answerEntry.id, answeredBy: scholarId, answeredAt: new Date() },
    });

    // Notify the asker that their question was answered
    this.notificationsService.create({
      userId: q.askerId,
      actorId: scholarId,
      type: 'SYSTEM',
      title: 'Fatwa answered',
      body: 'A scholar has answered your question',
    }).catch(err => this.logger.warn('Fatwa answer notification failed', err.message));

    return updated;
  }

  // ── Volunteer ───────────────────────────────────────────

  async createOpportunity(userId: string, dto: {
    title: string; description: string; category: string;
    location?: string; lat?: number; lng?: number; date?: string; spotsTotal?: number;
  }) {
    await this.moderateContent(dto.title, dto.description);
    return this.prisma.volunteerOpportunity.create({
      data: { organizerId: userId, title: sanitizeText(dto.title), description: sanitizeText(dto.description), category: dto.category as VolunteerCategory, location: dto.location, lat: dto.lat, lng: dto.lng, date: dto.date ? new Date(dto.date) : undefined, spotsTotal: dto.spotsTotal },
    });
  }

  async getOpportunities(category?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = {
      isActive: true,
      organizer: { isBanned: false, isDeactivated: false, isDeleted: false },
    };
    if (category) where.category = category;

    const opps = await this.prisma.volunteerOpportunity.findMany({
      where, orderBy: { createdAt: 'desc' }, take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { organizer: { select: USER_SELECT } },
    });
    const hasMore = opps.length > limit;
    if (hasMore) opps.pop();
    return { data: opps, meta: { cursor: opps[opps.length - 1]?.id || null, hasMore } };
  }

  // ── Islamic Events ──────────────────────────────────────

  async createEvent(userId: string, dto: {
    title: string; description?: string; eventType: string;
    location?: string; lat?: number; lng?: number; startDate: string;
    endDate?: string; isOnline?: boolean; streamUrl?: string; coverUrl?: string;
  }) {
    await this.moderateContent(dto.title, dto.description);
    return this.prisma.islamicEvent.create({
      data: { organizerId: userId, title: sanitizeText(dto.title), description: dto.description ? sanitizeText(dto.description) : dto.description, eventType: dto.eventType as IslamicEventType, location: dto.location, lat: dto.lat, lng: dto.lng, startDate: new Date(dto.startDate), endDate: dto.endDate ? new Date(dto.endDate) : undefined, isOnline: dto.isOnline, streamUrl: dto.streamUrl, coverUrl: dto.coverUrl },
    });
  }

  async getEvents(eventType?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = {
      startDate: { gte: new Date() },
      organizer: { isBanned: false, isDeactivated: false, isDeleted: false },
    };
    if (eventType) where.eventType = eventType;

    const events = await this.prisma.islamicEvent.findMany({
      where, orderBy: { startDate: 'asc' }, take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { organizer: { select: USER_SELECT } },
    });
    const hasMore = events.length > limit;
    if (hasMore) events.pop();
    return { data: events, meta: { cursor: events[events.length - 1]?.id || null, hasMore } };
  }

  // ── Reputation ──────────────────────────────────────────

  async getReputation(userId: string) {
    const rep = await this.prisma.userReputation.findUnique({ where: { userId } });
    if (!rep) return this.prisma.userReputation.create({ data: { userId } });
    return rep;
  }

  // DEFERRED (B09-#13): _reason is accepted but NOT stored — UserReputation model has no reason field.
  // Requires Prisma schema change to add a reason/audit log field to UserReputation or a separate ReputationLog table.
  async updateReputation(userId: string, delta: number, _reason: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const rep = await tx.userReputation.upsert({
        where: { userId },
        create: { userId, score: Math.max(0, delta) },
        update: { score: { increment: delta } },
      });
      const score = Math.max(0, rep.score);
      let tier: ReputationTier = 'NEWCOMER' as ReputationTier;
      if (score >= 1000) tier = 'ELDER' as ReputationTier;
      else if (score >= 500) tier = 'GUARDIAN' as ReputationTier;
      else if (score >= 200) tier = 'TRUSTED' as ReputationTier;
      else if (score >= 50) tier = 'MEMBER' as ReputationTier;
      return tx.userReputation.update({ where: { userId }, data: { score, tier } });
    });
  }

  // ── Voice Posts ─────────────────────────────────────────

  async createVoicePost(userId: string, dto: { audioUrl: string; duration: number; transcript?: string }) {
    if (dto.transcript) await this.moderateContent(dto.transcript);
    return this.prisma.voicePost.create({
      data: { userId, audioUrl: dto.audioUrl, duration: dto.duration, transcript: dto.transcript ? sanitizeText(dto.transcript) : dto.transcript },
      include: { user: { select: USER_SELECT } },
    });
  }

  async getVoicePosts(cursor?: string, limit = 20) {
    const where: Record<string, unknown> = {
      user: { isBanned: false, isDeactivated: false, isDeleted: false },
    };

    const posts = await this.prisma.voicePost.findMany({
      where, orderBy: { createdAt: 'desc' }, take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: USER_SELECT } },
    });
    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();
    return { data: posts, meta: { cursor: posts[posts.length - 1]?.id || null, hasMore } };
  }

  // ── Watch Parties ───────────────────────────────────────

  async createWatchParty(userId: string, dto: { videoId: string; title: string }) {
    await this.moderateContent(dto.title);
    const video = await this.prisma.video.findUnique({ where: { id: dto.videoId }, select: { id: true, status: true } });
    if (!video) throw new NotFoundException('Video not found');
    if (video.status !== 'PUBLISHED') throw new BadRequestException('Video is not available');

    return this.prisma.watchParty.create({
      data: { hostId: userId, videoId: dto.videoId, title: sanitizeText(dto.title), isActive: true },
    });
  }

  async getActiveWatchParties() {
    return this.prisma.watchParty.findMany({
      where: {
        isActive: true,
        host: { isBanned: false, isDeactivated: false, isDeleted: false },
      },
      orderBy: { viewerCount: 'desc' },
      take: 50,
      include: { host: { select: USER_SELECT } },
    });
  }

  // ── Shared Collections ──────────────────────────────────

  async createCollection(userId: string, dto: { name: string; description?: string; isPublic?: boolean }) {
    await this.moderateContent(dto.name, dto.description);
    return this.prisma.sharedCollection.create({
      data: { createdById: userId, name: sanitizeText(dto.name), description: dto.description ? sanitizeText(dto.description) : dto.description, isPublic: dto.isPublic },
    });
  }

  async getMyCollections(userId: string) {
    return this.prisma.sharedCollection.findMany({
      where: { createdById: userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  // ── Waqf ────────────────────────────────────────────────

  async createWaqf(userId: string, dto: { title: string; description: string; goalAmount: number }) {
    await this.moderateContent(dto.title, dto.description);
    return this.prisma.waqfFund.create({
      data: { createdById: userId, title: sanitizeText(dto.title), description: sanitizeText(dto.description), goalAmount: dto.goalAmount },
    });
  }

  async getWaqfFunds(cursor?: string, limit = 20) {
    const where: Record<string, unknown> = {
      isActive: true,
      creator: { isBanned: false, isDeactivated: false, isDeleted: false },
    };

    const funds = await this.prisma.waqfFund.findMany({
      where, orderBy: { raisedAmount: 'desc' }, take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { creator: { select: USER_SELECT } },
    });
    const hasMore = funds.length > limit;
    if (hasMore) funds.pop();
    return { data: funds, meta: { cursor: funds[funds.length - 1]?.id || null, hasMore } };
  }

  // ── Content Safety ──────────────────────────────────────

  async checkKindness(text: string): Promise<{ needsRephrase: boolean; suggestion?: string }> {
    const result = await this.contentSafety.moderateText(text);
    if (!result.safe) {
      return { needsRephrase: true, suggestion: result.suggestion || 'Would you like to rephrase this in a kinder way?' };
    }
    return { needsRephrase: false };
  }

  async getDataExport(userId: string) {
    // GDPR Article 15/20 — users have the right to ALL their data.
    // Capped at 10K per table. privacy.service.ts has the full GDPR export with streaming.
    const EXPORT_LIMIT = 10000;
    const [user, posts, threads, messages, reels, stories] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, username: true, displayName: true, email: true, phone: true,
          bio: true, avatarUrl: true, coverUrl: true, location: true, website: true,
          isVerified: true, isPrivate: true, language: true, createdAt: true, updatedAt: true,
        },
      }),
      this.prisma.post.findMany({ where: { userId }, select: { id: true, content: true, mediaUrls: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT }),
      this.prisma.thread.findMany({ where: { userId }, select: { id: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT }),
      this.prisma.message.findMany({ where: { senderId: userId }, select: { id: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT }),
      this.prisma.reel.findMany({ where: { userId }, select: { id: true, caption: true, videoUrl: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT }),
      this.prisma.story.findMany({ where: { userId }, select: { id: true, mediaUrl: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT }),
    ]);
    return {
      user, posts, threads, messages, reels, stories,
      exportedAt: new Date().toISOString(),
      truncated: {
        posts: posts.length >= EXPORT_LIMIT,
        threads: threads.length >= EXPORT_LIMIT,
        messages: messages.length >= EXPORT_LIMIT,
        reels: reels.length >= EXPORT_LIMIT,
        stories: stories.length >= EXPORT_LIMIT,
      },
    };
  }
}
