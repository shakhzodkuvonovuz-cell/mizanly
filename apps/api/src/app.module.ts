import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './config/prisma.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
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
  ],
})
export class AppModule {}
