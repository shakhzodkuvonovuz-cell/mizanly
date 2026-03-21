import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';

const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true };

@Injectable()
export class CommunityService {
  constructor(private prisma: PrismaService) {}

  // ── Local Boards ────────────────────────────────────────

  async createBoard(userId: string, dto: { name: string; description?: string; city: string; country: string; lat?: number; lng?: number }) {
    return this.prisma.localBoard.create({ data: { createdById: userId, ...dto } });
  }

  async getBoards(city?: string, country?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = {};
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
      return await this.prisma.mentorship.create({
        data: { menteeId, mentorId: dto.mentorId, topic: dto.topic, notes: dto.notes },
      });
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
    if (m.status !== 'pending') throw new BadRequestException('Mentorship request is no longer pending');
    return this.prisma.mentorship.update({
      where: { mentorId_menteeId: { mentorId, menteeId } },
      data: { status: accept ? 'active' : 'cancelled', startedAt: accept ? new Date() : undefined },
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
    return this.prisma.studyCircle.create({ data: { leaderId: userId, ...dto } });
  }

  async getStudyCircles(topic?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { isActive: true };
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
    return this.prisma.fatwaQuestion.create({
      data: { askerId: userId, ...dto },
    });
  }

  async getFatwaQuestions(status?: string, madhab?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = {};
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
      where: { userId: scholarId, status: 'APPROVED' },
    });
    if (!verification) throw new ForbiddenException('Only verified scholars can answer fatwa questions');

    const q = await this.prisma.fatwaQuestion.findUnique({ where: { id: questionId } });
    if (!q) throw new NotFoundException('Fatwa question not found');
    if (q.status === 'answered') throw new ConflictException('Question already answered');
    return this.prisma.fatwaQuestion.update({
      where: { id: questionId },
      data: { status: 'answered', answerId: answer, answeredBy: scholarId, answeredAt: new Date() },
    });
  }

  // ── Volunteer ───────────────────────────────────────────

  async createOpportunity(userId: string, dto: {
    title: string; description: string; category: string;
    location?: string; lat?: number; lng?: number; date?: string; spotsTotal?: number;
  }) {
    return this.prisma.volunteerOpportunity.create({
      data: { organizerId: userId, ...dto, date: dto.date ? new Date(dto.date) : undefined },
    });
  }

  async getOpportunities(category?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { isActive: true };
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
    return this.prisma.islamicEvent.create({
      data: { organizerId: userId, ...dto, startDate: new Date(dto.startDate), endDate: dto.endDate ? new Date(dto.endDate) : undefined },
    });
  }

  async getEvents(eventType?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { startDate: { gte: new Date() } };
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

  async updateReputation(userId: string, delta: number, reason: string) {
    const rep = await this.prisma.userReputation.upsert({
      where: { userId },
      create: { userId, score: Math.max(0, delta) },
      update: { score: { increment: delta } },
    });

    // Ensure score doesn't go negative
    if (rep.score < 0) {
      await this.prisma.userReputation.update({
        where: { userId },
        data: { score: 0 },
      });
      rep.score = 0;
    }

    // Update tier
    let tier = 'newcomer';
    if (rep.score >= 1000) tier = 'elder';
    else if (rep.score >= 500) tier = 'guardian';
    else if (rep.score >= 200) tier = 'trusted';
    else if (rep.score >= 50) tier = 'member';

    return this.prisma.userReputation.update({ where: { userId }, data: { tier } });
  }

  // ── Voice Posts ─────────────────────────────────────────

  async createVoicePost(userId: string, dto: { audioUrl: string; duration: number; transcript?: string }) {
    return this.prisma.voicePost.create({
      data: { userId, ...dto },
      include: { user: { select: USER_SELECT } },
    });
  }

  async getVoicePosts(cursor?: string, limit = 20) {
    const where: Record<string, unknown> = {};

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
    // Verify video exists
    const video = await this.prisma.video.findUnique({ where: { id: dto.videoId }, select: { id: true, status: true } });
    if (!video) throw new NotFoundException('Video not found');
    if (video.status !== 'PUBLISHED') throw new BadRequestException('Video is not available');

    return this.prisma.watchParty.create({
      data: { hostId: userId, ...dto, isActive: true },
    });
  }

  async getActiveWatchParties() {
    return this.prisma.watchParty.findMany({
      where: { isActive: true },
      orderBy: { viewerCount: 'desc' },
      take: 50,
      include: { host: { select: USER_SELECT } },
    });
  }

  // ── Shared Collections ──────────────────────────────────

  async createCollection(userId: string, dto: { name: string; description?: string; isPublic?: boolean }) {
    return this.prisma.sharedCollection.create({
      data: { createdById: userId, ...dto },
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
    return this.prisma.waqfFund.create({
      data: { createdById: userId, ...dto },
    });
  }

  async getWaqfFunds(cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { isActive: true };

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
    // Simple anger/negativity detection
    const negativePatterns = /\b(hate|stupid|idiot|shut up|kill|die|worst|trash|garbage|loser)\b/i;
    if (negativePatterns.test(text)) {
      return { needsRephrase: true, suggestion: 'Would you like to rephrase this in a kinder way?' };
    }
    return { needsRephrase: false };
  }

  async getDataExport(userId: string) {
    const [user, posts, threads, messages] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.post.findMany({ where: { userId }, select: { id: true, content: true, mediaUrls: true, createdAt: true },
      take: 50,
    }),
      this.prisma.thread.findMany({ where: { userId }, select: { id: true, content: true, createdAt: true },
      take: 50,
    }),
      this.prisma.message.findMany({ where: { senderId: userId }, select: { id: true, content: true, createdAt: true },
      take: 50,
    }),
    ]);
    return { user, posts, threads, messages, exportedAt: new Date().toISOString() };
  }
}
