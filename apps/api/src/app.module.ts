import { Module, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './config/prisma.module';
import { RedisModule } from './config/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PostsModule } from './modules/posts/posts.module';
import { StoriesModule } from './modules/stories/stories.module';
import { ThreadsModule } from './modules/threads/threads.module';
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
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule, RedisModule,
    AuthModule,
    UsersModule,
    PostsModule,
    StoriesModule,
    ThreadsModule,
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
