import { Module, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import * as Joi from 'joi';
import { ScheduleModule } from '@nestjs/schedule';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './config/prisma.module';
import { RedisModule } from './config/redis.module';
import { AsyncJobsModule } from './common/services/async-jobs.module';
import { QueueModule } from './common/queue/queue.module';
import { FeatureFlagsModule } from './common/services/feature-flags.module';
import { AnalyticsModule } from './common/services/analytics.module';
import { PlatformServicesModule } from './common/services/platform-services.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PostsModule } from './modules/posts/posts.module';
import { StoriesModule } from './modules/stories/stories.module';
import { ThreadsModule } from './modules/threads/threads.module';
import { ReelsModule } from './modules/reels/reels.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { VideosModule } from './modules/videos/videos.module';
import { PlaylistsModule } from './modules/playlists/playlists.module';
import { MessagesModule } from './modules/messages/messages.module';
import { CirclesModule } from './modules/circles/circles.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SearchModule } from './modules/search/search.module';
import { FollowsModule } from './modules/follows/follows.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { MutesModule } from './modules/mutes/mutes.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ProfileLinksModule } from './modules/profile-links/profile-links.module';
import { HealthModule } from './modules/health/health.module';
import { UploadModule } from './modules/upload/upload.module';
import { DevicesModule } from './modules/devices/devices.module';
import { AdminModule } from './modules/admin/admin.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { MajlisListsModule } from './modules/majlis-lists/majlis-lists.module';
import { PollsModule } from './modules/polls/polls.module';
import { SubtitlesModule } from './modules/subtitles/subtitles.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { DraftsModule } from './modules/drafts/drafts.module';
import { BroadcastModule } from './modules/broadcast/broadcast.module';
import { LiveModule } from './modules/live/live.module';
import { StickersModule } from './modules/stickers/stickers.module';
import { CollabsModule } from './modules/collabs/collabs.module';
import { ChannelPostsModule } from './modules/channel-posts/channel-posts.module';
import { AudioTracksModule } from './modules/audio-tracks/audio-tracks.module';
import { FeedModule } from './modules/feed/feed.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HashtagsModule } from './modules/hashtags/hashtags.module';
import { BookmarksModule } from './modules/bookmarks/bookmarks.module';
import { WatchHistoryModule } from './modules/watch-history/watch-history.module';
import { EventsModule } from './modules/events/events.module';
import { MonetizationModule } from './modules/monetization/monetization.module';
import { TwoFactorModule } from './modules/two-factor/two-factor.module';
import { AudioRoomsModule } from './modules/audio-rooms/audio-rooms.module';
import { IslamicModule } from './modules/islamic/islamic.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { CommunitiesModule } from './modules/communities/communities.module';
import { StreamModule } from './modules/stream/stream.module';
import { ReelTemplatesModule } from './modules/reel-templates/reel-templates.module';
import { StoryChainsModule } from './modules/story-chains/story-chains.module';
import { VideoRepliesModule } from './modules/video-replies/video-replies.module';
// EncryptionModule REMOVED — replaced by Go E2E Key Server (apps/e2e-server/)
// Old module files kept at src/modules/encryption/ for reference during transition.
import { ChatExportModule } from './modules/chat-export/chat-export.module';
import { CreatorModule } from './modules/creator/creator.module';
import { GiftsModule } from './modules/gifts/gifts.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { RestrictsModule } from './modules/restricts/restricts.module';
import { ParentalControlsModule } from './modules/parental-controls/parental-controls.module';
import { DownloadsModule } from './modules/downloads/downloads.module';
import { ClipsModule } from './modules/clips/clips.module';
import { AiModule } from './modules/ai/ai.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { CommunityModule as CommunityV2Module } from './modules/community/community.module';
import { TelegramFeaturesModule } from './modules/telegram-features/telegram-features.module';
import { DiscordFeaturesModule } from './modules/discord-features/discord-features.module';
import { EmbeddingsModule } from './modules/embeddings/embeddings.module';
import { RetentionModule } from './modules/retention/retention.module';
import { AltProfileModule } from './modules/alt-profile/alt-profile.module';
import { ThumbnailsModule } from './modules/thumbnails/thumbnails.module';
import { OgModule } from './modules/og/og.module';
import { HalalModule } from './modules/halal/halal.module';
import { MosquesModule } from './modules/mosques/mosques.module';
import { ScholarQAModule } from './modules/scholar-qa/scholar-qa.module';
import { CommunityNotesModule } from './modules/community-notes/community-notes.module';
import { ChecklistsModule } from './modules/checklists/checklists.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { GiphyModule } from './modules/giphy/giphy.module';
import { EmailModule } from './common/services/email.module';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { ResponseTimeMiddleware } from './common/middleware/response-time.middleware';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        CLERK_SECRET_KEY: Joi.string().required(),
        REDIS_URL: Joi.string().allow('').default(''),
        STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
        STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
        R2_ACCOUNT_ID: Joi.string().allow('').default(''),
        R2_ACCESS_KEY_ID: Joi.string().allow('').default(''),
        R2_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
        R2_BUCKET_NAME: Joi.string().allow('').default(''),
        TOTP_ENCRYPTION_KEY: Joi.string().allow('').default(''),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    // Redis-backed distributed rate limiting (persists across deploys, shared across instances)
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 100 }],
      ...(process.env.REDIS_URL ? { storage: new ThrottlerStorageRedisService(process.env.REDIS_URL) } : {}),
    }),
    ScheduleModule.forRoot(),
    PrismaModule, RedisModule, AsyncJobsModule, QueueModule, FeatureFlagsModule, AnalyticsModule, PlatformServicesModule,
    AuthModule,
    UsersModule,
    PostsModule,
    StoriesModule,
    ThreadsModule,
    ReelsModule,
    ChannelsModule,
    VideosModule,
    PlaylistsModule,
    MessagesModule,
    CirclesModule,
    NotificationsModule,
    SearchModule,
    FollowsModule,
    BlocksModule,
    MutesModule,
    SettingsModule,
    ProfileLinksModule,
    HealthModule,
    UploadModule,
    DevicesModule,
    AdminModule,
    RecommendationsModule,
    SchedulingModule,
    MajlisListsModule,
    PollsModule,
    SubtitlesModule,
    PrivacyModule,
    DraftsModule,
    BroadcastModule,
    LiveModule,
    StickersModule,
    CollabsModule,
    ChannelPostsModule,
    AudioTracksModule,
    FeedModule,
    ReportsModule,
    HashtagsModule,
    BookmarksModule,
    WatchHistoryModule,
    EventsModule,
    MonetizationModule,
    TwoFactorModule,
    AudioRoomsModule,
    IslamicModule,
    PaymentsModule,
    ModerationModule,
    CommunitiesModule,
    StreamModule,
    ReelTemplatesModule,
    StoryChainsModule,
    VideoRepliesModule,
    // EncryptionModule removed — Go E2E Key Server handles key management
    ChatExportModule,
    CreatorModule,
    GiftsModule,
    PromotionsModule,
    RestrictsModule,
    ParentalControlsModule,
    DownloadsModule,
    ClipsModule,
    AiModule,
    GamificationModule,
    CommerceModule,
    CommunityV2Module,
    TelegramFeaturesModule,
    DiscordFeaturesModule,
    EmbeddingsModule,
    RetentionModule,
    AltProfileModule,
    ThumbnailsModule,
    OgModule,
    HalalModule,
    MosquesModule,
    ScholarQAModule,
    CommunityNotesModule,
    ChecklistsModule,
    WebhooksModule,
    WaitlistModule,
    GiphyModule,
    EmailModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware, SecurityHeadersMiddleware, RequestLoggerMiddleware, ResponseTimeMiddleware).forRoutes('*');
  }
}
