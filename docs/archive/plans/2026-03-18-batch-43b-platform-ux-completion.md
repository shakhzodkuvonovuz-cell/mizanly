# Batch 43B: Platform & UX Parity Completion (Tier 8) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 12 remaining Tier 8 features to achieve full platform & UX parity with Instagram, YouTube, TikTok, and WhatsApp — completing the "launch week" feature set.

**Architecture:** Extends existing modules (videos, channels, playlists, posts, settings, notifications). Adds 6 new Prisma models + extends 4 existing. Mobile adds ~10 new screens + a global MiniPlayer component + Expo config plugins for native features. 2 new backend modules (clips, parental-controls). Everything integrates into existing NestJS + Expo Router structure.

**Tech Stack:** NestJS 10 + Prisma + Expo SDK 52 + expo-file-system (downloads) + expo-av (PiP) + react-native-reanimated (mini player gestures) + expo-image-manipulator (ambient color) + Zustand + Socket.io (premiere chat)

---

## NEW PRISMA MODELS (Agent 0 — Schema)

Add to `apps/api/prisma/schema.prisma`:

```prisma
model OfflineDownload {
  id          String   @id @default(uuid())
  userId      String
  contentType String   // post | video | reel
  contentId   String
  quality     String   @default("auto") // auto | 360p | 720p | 1080p
  fileSize    Int      @default(0) // bytes
  status      String   @default("pending") // pending | downloading | complete | failed | paused
  progress    Float    @default(0) // 0.0 to 1.0
  filePath    String?
  expiresAt   DateTime? // optional expiry for downloaded content
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, contentId])
  @@index([userId, status])
  @@map("offline_downloads")
}

model VideoPremiere {
  id              String   @id @default(uuid())
  videoId         String   @unique
  scheduledAt     DateTime
  isLive          Boolean  @default(false)
  chatEnabled     Boolean  @default(true)
  reminderCount   Int      @default(0)
  viewerCount     Int      @default(0)
  countdownTheme  String   @default("emerald") // emerald | gold | cosmic
  trailerUrl      String?  // optional teaser clip
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  video           Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)
  reminders       PremiereReminder[]
  @@index([scheduledAt])
  @@map("video_premieres")
}

model PremiereReminder {
  premiereId String
  userId     String
  createdAt  DateTime @default(now())
  premiere   VideoPremiere @relation(fields: [premiereId], references: [id], onDelete: Cascade)
  @@id([premiereId, userId])
  @@map("premiere_reminders")
}

model VideoClip {
  id            String   @id @default(uuid())
  userId        String
  sourceVideoId String
  title         String?  @db.VarChar(100)
  startTime     Float    // seconds
  endTime       Float    // seconds
  duration      Float    // endTime - startTime
  clipUrl       String?  // Cloudflare Stream clipped URL
  streamId      String?  // Cloudflare Stream clip ID
  hlsUrl        String?
  thumbnailUrl  String?
  viewsCount    Int      @default(0)
  likesCount    Int      @default(0)
  sharesCount   Int      @default(0)
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  sourceVideo   Video    @relation(fields: [sourceVideoId], references: [id], onDelete: Cascade)
  @@index([sourceVideoId])
  @@index([userId])
  @@map("video_clips")
}

model EndScreen {
  id        String   @id @default(uuid())
  videoId   String
  type      String   // subscribe | watch_next | playlist | link
  targetId  String?  // videoId, playlistId, or channelId depending on type
  label     String   @db.VarChar(60)
  url       String?  // for link type
  position  String   @default("bottom-right") // top-left | top-right | bottom-left | bottom-right | center-left | center-right
  showAtSeconds Float @default(10) // seconds before end to show
  createdAt DateTime @default(now())
  video     Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)
  @@index([videoId])
  @@map("end_screens")
}

model PlaylistCollaborator {
  playlistId String
  userId     String
  role       String   @default("editor") // editor | viewer
  addedById  String
  addedAt    DateTime @default(now())
  playlist   Playlist @relation(fields: [playlistId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([playlistId, userId])
  @@map("playlist_collaborators")
}

model ParentalControl {
  id                String   @id @default(uuid())
  parentUserId      String
  childUserId       String   @unique
  pin               String   // 4-digit PIN hash for settings access
  restrictedMode    Boolean  @default(true)
  maxAgeRating      String   @default("PG") // G | PG | PG13 | R
  dailyLimitMinutes Int?
  dmRestriction     String   @default("none") // none | contacts_only | disabled
  canGoLive         Boolean  @default(false)
  canPost           Boolean  @default(true)
  canComment        Boolean  @default(true)
  activityDigest    Boolean  @default(true) // weekly digest to parent
  lastDigestAt      DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  parent            User     @relation("ParentControls", fields: [parentUserId], references: [id], onDelete: Cascade)
  child             User     @relation("ChildControls", fields: [childUserId], references: [id], onDelete: Cascade)
  @@unique([parentUserId, childUserId])
  @@map("parental_controls")
}
```

**Extend existing models:**

Add to `Playlist` model:
```prisma
isCollaborative Boolean @default(false)
collaborators   PlaylistCollaborator[]
```

Add to `Channel` model:
```prisma
trailerVideoId String?
trailerVideo   Video?  @relation("ChannelTrailer", fields: [trailerVideoId], references: [id], onDelete: SetNull)
```

Add to `Video` model:
```prisma
isPremiereEnabled Boolean @default(false)
premiere          VideoPremiere?
clips             VideoClip[]
endScreens        EndScreen[]
channelTrailerOf  Channel? @relation("ChannelTrailer")
```

Add to `Post` model:
```prisma
isDownloadable Boolean @default(true)
```

Add to `User` model:
```prisma
isChildAccount    Boolean @default(false)
offlineDownloads  OfflineDownload[]
videoClips        VideoClip[]
playlistCollabs   PlaylistCollaborator[]
parentControls    ParentalControl[] @relation("ParentControls")
childControl      ParentalControl?  @relation("ChildControls")
```

**~150 lines of schema changes**

---

## AGENT 1: Share Extension

**Creates:**
- `apps/mobile/app/(screens)/share-receive.tsx`
- `apps/mobile/plugins/share-extension/app.plugin.js` (Expo config plugin)

**Modifies:**
- `apps/mobile/app.json` (add share extension config)
- `apps/mobile/app/_layout.tsx` (handle incoming share intent)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Expo Config Plugin — `plugins/share-extension/app.plugin.js`:**
```javascript
const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

module.exports = function withShareExtension(config) {
  // Android: Add intent filters for receiving shared content
  config = withAndroidManifest(config, (config) => {
    const mainActivity = config.modResults.manifest.application[0].activity[0];
    if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];

    // Text share intent
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': 'text/plain' } }],
    });

    // Image share intent
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': 'image/*' } }],
    });

    // Video share intent
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': 'video/*' } }],
    });

    // Multiple items
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND_MULTIPLE' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': 'image/*' } }],
    });

    return config;
  });

  // iOS: Register URL types and share extension
  config = withInfoPlist(config, (config) => {
    config.modResults.CFBundleURLTypes = [
      ...(config.modResults.CFBundleURLTypes || []),
      { CFBundleURLSchemes: ['mizanly'] },
    ];
    config.modResults.NSPhotoLibraryUsageDescription =
      config.modResults.NSPhotoLibraryUsageDescription || 'Access photos to share on Mizanly';
    return config;
  });

  return config;
};
```

**Mobile — `_layout.tsx` — add share intent handler:**
```typescript
// Add to imports
import * as Linking from 'expo-linking';
import { useURL } from 'expo-linking';

// Inside RootLayout, add:
const url = useURL();

useEffect(() => {
  if (url) {
    const parsed = Linking.parse(url);
    // Handle mizanly:// deep links for shared content
    if (parsed.path === 'share' || parsed.queryParams?.sharedText || parsed.queryParams?.sharedImage) {
      router.push({
        pathname: '/(screens)/share-receive',
        params: {
          sharedText: parsed.queryParams?.sharedText as string,
          sharedImage: parsed.queryParams?.sharedImage as string,
          sharedVideo: parsed.queryParams?.sharedVideo as string,
          sharedUrl: parsed.queryParams?.sharedUrl as string,
        },
      });
    }
  }
}, [url]);
```

**Mobile — `share-receive.tsx` (~400 lines):**
```tsx
// Full share receive screen with:
// - GlassHeader with "Share to Mizanly" title
// - Preview card showing shared content (text, image, video, URL)
// - URL detection: extract preview metadata (title, image, description)
// - Space selector: 4 horizontal cards (Saf, Majlis, Bakra, Minbar)
//   Each card: space icon + name + brief description
//   Auto-recommend space based on content type:
//     - Image → Saf, Text → Majlis, Video → Bakra/Minbar
// - Caption input (TextInput with CharCountRing)
// - GradientButton "Share" → navigates to respective create screen with prefilled content
// - OR direct post option for quick sharing
// - ScreenErrorBoundary, Skeleton while loading URL preview
// - Full RTL support, i18n

// Screen reads incoming params:
const { sharedText, sharedImage, sharedVideo, sharedUrl } = useLocalSearchParams();

// URL preview extraction using fetch + regex for og:title, og:image, og:description
// Image preview using Image component with zoom
// Video preview using VideoPlayer component (thumbnail only)

// Space selection:
const SPACES = [
  { id: 'SAF', icon: 'image', label: t('shareReceive.saf'), color: colors.emerald },
  { id: 'MAJLIS', icon: 'message-circle', label: t('shareReceive.majlis'), color: colors.gold },
  { id: 'BAKRA', icon: 'play', label: t('shareReceive.bakra'), color: colors.info },
  { id: 'MINBAR', icon: 'video', label: t('shareReceive.minbar'), color: '#9333EA' },
];

// On share: route to create-post/create-thread/create-reel with params
const handleShare = () => {
  const params = { prefillContent: caption, prefillMedia: sharedImage || sharedVideo };
  switch (selectedSpace) {
    case 'SAF': router.push({ pathname: '/(screens)/create-post', params }); break;
    case 'MAJLIS': router.push({ pathname: '/(screens)/create-thread', params }); break;
    case 'BAKRA': router.push({ pathname: '/(screens)/create-reel', params }); break;
    case 'MINBAR': router.push({ pathname: '/(screens)/create-video', params }); break;
  }
};
```

**i18n keys:**
```json
"shareReceive": {
  "title": "Share to Mizanly",
  "selectSpace": "Choose a Space",
  "saf": "Saf — Photo & Feed",
  "majlis": "Majlis — Discussion",
  "bakra": "Bakra — Short Video",
  "minbar": "Minbar — Long Video",
  "addCaption": "Add a caption...",
  "share": "Share",
  "quickPost": "Quick Post",
  "preview": "Shared Content",
  "urlPreview": "Link Preview",
  "noContent": "No content to share",
  "success": "Shared successfully!"
}
```

**~500 lines total**

---

## AGENT 2: Offline Download

**Creates:**
- `apps/api/src/modules/downloads/downloads.module.ts`
- `apps/api/src/modules/downloads/downloads.service.ts`
- `apps/api/src/modules/downloads/downloads.controller.ts`
- `apps/api/src/modules/downloads/dto/create-download.dto.ts`
- `apps/mobile/app/(screens)/downloads.tsx`
- `apps/mobile/src/services/downloadManager.ts`

**Modifies:**
- `apps/api/src/app.module.ts` (register DownloadsModule)
- `apps/mobile/src/services/api.ts` (add downloadsApi)
- `apps/mobile/src/types/index.ts` (add OfflineDownload type)
- `apps/mobile/src/store/index.ts` (add download state)
- `apps/mobile/app/(screens)/settings.tsx` (add "Downloads" row)
- `apps/mobile/src/components/ui/VideoPlayer.tsx` (add download button)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — `dto/create-download.dto.ts`:**
```typescript
import { IsString, IsIn, IsOptional } from 'class-validator';

export class CreateDownloadDto {
  @IsString() contentId: string;
  @IsIn(['post', 'video', 'reel']) contentType: string;
  @IsOptional() @IsIn(['auto', '360p', '720p', '1080p']) quality?: string;
}
```

**Backend — `downloads.service.ts`:**
```typescript
@Injectable()
export class DownloadsService {
  constructor(private prisma: PrismaService) {}

  async requestDownload(userId: string, dto: CreateDownloadDto) {
    // Verify content exists and is downloadable
    let fileSize = 0;
    let downloadUrl = '';

    if (dto.contentType === 'video') {
      const video = await this.prisma.video.findUnique({ where: { id: dto.contentId } });
      if (!video) throw new NotFoundException('Video not found');
      if (video.status !== 'PUBLISHED') throw new ForbiddenException('Video not available');
      downloadUrl = video.hlsUrl || video.videoUrl;
    } else if (dto.contentType === 'post') {
      const post = await this.prisma.post.findUnique({ where: { id: dto.contentId } });
      if (!post) throw new NotFoundException('Post not found');
      if (!post.isDownloadable) throw new ForbiddenException('Download disabled by author');
      downloadUrl = post.mediaUrls[0] || '';
    } else if (dto.contentType === 'reel') {
      const reel = await this.prisma.reel.findUnique({ where: { id: dto.contentId } });
      if (!reel) throw new NotFoundException('Reel not found');
      downloadUrl = reel.hlsUrl || reel.videoUrl;
    }

    if (!downloadUrl) throw new BadRequestException('No media to download');

    // Upsert: if already downloaded, update; otherwise create
    return this.prisma.offlineDownload.upsert({
      where: { userId_contentId: { userId, contentId: dto.contentId } },
      create: {
        userId,
        contentId: dto.contentId,
        contentType: dto.contentType,
        quality: dto.quality || 'auto',
        status: 'pending',
      },
      update: {
        status: 'pending',
        quality: dto.quality || 'auto',
        progress: 0,
      },
    });
  }

  async getDownloads(userId: string, status?: string, cursor?: string, limit = 20) {
    const where: any = { userId };
    if (status) where.status = status;
    if (cursor) where.id = { lt: cursor };

    const downloads = await this.prisma.offlineDownload.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = downloads.length > limit;
    if (hasMore) downloads.pop();

    return {
      data: downloads,
      meta: { cursor: downloads[downloads.length - 1]?.id || null, hasMore },
    };
  }

  async getDownloadUrl(userId: string, downloadId: string) {
    const download = await this.prisma.offlineDownload.findFirst({
      where: { id: downloadId, userId },
    });
    if (!download) throw new NotFoundException();

    // Return presigned URL for the content
    let url = '';
    if (download.contentType === 'video') {
      const video = await this.prisma.video.findUnique({ where: { id: download.contentId } });
      url = video?.hlsUrl || video?.videoUrl || '';
    } else if (download.contentType === 'post') {
      const post = await this.prisma.post.findUnique({ where: { id: download.contentId } });
      url = post?.mediaUrls[0] || '';
    } else if (download.contentType === 'reel') {
      const reel = await this.prisma.reel.findUnique({ where: { id: download.contentId } });
      url = reel?.hlsUrl || reel?.videoUrl || '';
    }

    return { url, contentType: download.contentType, quality: download.quality };
  }

  async updateProgress(userId: string, downloadId: string, progress: number, fileSize?: number) {
    return this.prisma.offlineDownload.update({
      where: { id: downloadId, userId },
      data: {
        progress: Math.min(progress, 1),
        status: progress >= 1 ? 'complete' : 'downloading',
        ...(fileSize && { fileSize }),
      },
    });
  }

  async deleteDownload(userId: string, downloadId: string) {
    return this.prisma.offlineDownload.delete({
      where: { id: downloadId, userId },
    });
  }

  async getStorageUsed(userId: string) {
    const result = await this.prisma.offlineDownload.aggregate({
      where: { userId, status: 'complete' },
      _sum: { fileSize: true },
      _count: true,
    });
    return {
      totalBytes: result._sum.fileSize || 0,
      totalFiles: result._count,
    };
  }
}
```

**Controller endpoints:**
```
POST   /downloads               (ClerkAuthGuard) — request download
GET    /downloads               (ClerkAuthGuard) — list downloads (?status=complete&cursor=)
GET    /downloads/:id/url       (ClerkAuthGuard) — get download URL
PATCH  /downloads/:id/progress  (ClerkAuthGuard) — update progress
DELETE /downloads/:id           (ClerkAuthGuard) — delete download record
GET    /downloads/storage       (ClerkAuthGuard) — get storage usage
```

**Mobile — `downloadManager.ts` (~200 lines):**
```typescript
import * as FileSystem from 'expo-file-system';

const DOWNLOAD_DIR = `${FileSystem.documentDirectory}downloads/`;

interface DownloadTask {
  id: string;
  contentId: string;
  contentType: string;
  downloadResumable: FileSystem.DownloadResumable | null;
  progress: number;
  status: 'pending' | 'downloading' | 'complete' | 'failed' | 'paused';
}

class DownloadManager {
  private tasks: Map<string, DownloadTask> = new Map();

  async ensureDir() {
    const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
  }

  async startDownload(downloadId: string, url: string, contentId: string, contentType: string,
    onProgress: (progress: number) => void) {
    await this.ensureDir();
    const ext = contentType === 'video' ? 'mp4' : contentType === 'reel' ? 'mp4' : 'jpg';
    const filePath = `${DOWNLOAD_DIR}${contentId}.${ext}`;

    const downloadResumable = FileSystem.createDownloadResumable(
      url, filePath, {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        this.tasks.set(downloadId, { ...this.tasks.get(downloadId)!, progress, status: 'downloading' });
        onProgress(progress);
      }
    );

    this.tasks.set(downloadId, { id: downloadId, contentId, contentType, downloadResumable, progress: 0, status: 'downloading' });

    try {
      const result = await downloadResumable.downloadAsync();
      this.tasks.set(downloadId, { ...this.tasks.get(downloadId)!, progress: 1, status: 'complete' });
      return result?.uri || filePath;
    } catch (e) {
      this.tasks.set(downloadId, { ...this.tasks.get(downloadId)!, status: 'failed' });
      throw e;
    }
  }

  async pauseDownload(downloadId: string) {
    const task = this.tasks.get(downloadId);
    if (task?.downloadResumable) {
      await task.downloadResumable.pauseAsync();
      this.tasks.set(downloadId, { ...task, status: 'paused' });
    }
  }

  async resumeDownload(downloadId: string, onProgress: (p: number) => void) {
    const task = this.tasks.get(downloadId);
    if (task?.downloadResumable) {
      const result = await task.downloadResumable.resumeAsync();
      this.tasks.set(downloadId, { ...task, status: 'complete', progress: 1 });
      return result?.uri;
    }
  }

  async deleteFile(contentId: string) {
    const files = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR).catch(() => []);
    for (const f of files) {
      if (f.startsWith(contentId)) {
        await FileSystem.deleteAsync(`${DOWNLOAD_DIR}${f}`, { idempotent: true });
      }
    }
  }

  async getStorageInfo() {
    const free = await FileSystem.getFreeDiskStorageAsync();
    const total = await FileSystem.getTotalDiskCapacityAsync();
    return { free, total, used: total - free };
  }

  getTask(downloadId: string) { return this.tasks.get(downloadId); }
}

export const downloadManager = new DownloadManager();
```

**Mobile — `downloads.tsx` (~500 lines):**
```
// Full downloads management screen:
// - GlassHeader: "Downloads" + storage usage badge (e.g., "234 MB")
// - Storage bar: visual bar showing used/available space with colors
//   - Green for downloads, gray for other, dark for free
//   - Text: "234 MB of 64 GB used"
// - Filter tabs: All | Downloading | Complete (horizontal chips)
// - Download quality selector in header menu (BottomSheet: HD/SD/Audio Only)
// - FlatList of download items:
//   Each item: thumbnail + title + content type badge + size + status
//   - Downloading: animated progress bar (emerald gradient), pause button
//   - Paused: progress bar frozen, resume button
//   - Complete: checkmark badge, play button, delete button
//   - Failed: red badge, retry button
//   - Swipe-to-delete with Animated translateX
// - Long-press BottomSheet: Play Offline, Share, Delete, View Original
// - "Delete All" in header menu
// - EmptyState: "No downloads yet" with download icon
// - ScreenErrorBoundary, RefreshControl, Skeleton.Rect placeholders
// - Sort: by date (default) or by size
// - Total storage summary at bottom
```

**Store additions:**
```typescript
downloadQueue: string[]; // download IDs currently active
addToDownloadQueue: (id: string) => void;
removeFromDownloadQueue: (id: string) => void;
```

**i18n keys:**
```json
"downloads": {
  "title": "Downloads",
  "storage": "Storage",
  "storageUsed": "{{used}} of {{total}} used",
  "all": "All",
  "downloading": "Downloading",
  "complete": "Complete",
  "paused": "Paused",
  "failed": "Failed",
  "retry": "Retry",
  "pause": "Pause",
  "resume": "Resume",
  "delete": "Delete",
  "deleteAll": "Delete All",
  "deleteConfirm": "Delete this download?",
  "deleteAllConfirm": "Delete all downloads? This will free up {{size}}.",
  "playOffline": "Play Offline",
  "viewOriginal": "View Original",
  "quality": "Download Quality",
  "qualityHD": "HD (720p)",
  "qualitySD": "SD (360p)",
  "qualityAudio": "Audio Only",
  "empty": "No downloads yet",
  "emptySubtitle": "Download videos and posts to watch offline",
  "downloadStarted": "Download started",
  "downloadComplete": "Download complete",
  "downloadFailed": "Download failed",
  "noSpace": "Not enough storage space"
}
```

**~800 lines total**

---

## AGENT 3: Picture-in-Picture (PiP)

**Creates:**
- `apps/mobile/src/hooks/usePiP.ts`

**Modifies:**
- `apps/mobile/src/components/ui/VideoPlayer.tsx` (add PiP button + PiP mode handling)
- `apps/mobile/app/(screens)/video/[id].tsx` (activate PiP on navigation away)
- `apps/mobile/app/(screens)/reel/[id].tsx` (activate PiP on navigation away)
- `apps/mobile/src/store/index.ts` (add PiP state)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Hook — `usePiP.ts` (~100 lines):**
```typescript
import { useRef, useCallback, useState, useEffect } from 'react';
import { AppState, Platform, Dimensions } from 'react-native';
import { Video, AVPlaybackStatus } from 'expo-av';

interface PiPConfig {
  videoRef: React.RefObject<Video>;
  isPlaying: boolean;
  onPiPChange?: (active: boolean) => void;
}

export function usePiP({ videoRef, isPlaying, onPiPChange }: PiPConfig) {
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isPiPSupported, setIsPiPSupported] = useState(false);

  useEffect(() => {
    // PiP is supported on Android 8+ (API 26+) and iOS 14+
    // expo-av Video component supports PiP natively on both platforms
    setIsPiPSupported(Platform.OS === 'android' || Platform.OS === 'ios');
  }, []);

  const enterPiP = useCallback(async () => {
    if (!isPiPSupported || !videoRef.current || !isPlaying) return;

    try {
      if (Platform.OS === 'android') {
        // Android: Use native PiP mode via activity
        const { NativeModules } = require('react-native');
        NativeModules.PiPModule?.enterPiPMode?.();
      }
      // iOS: expo-av Video handles PiP via useNativeControls + allowsPictureInPicture
      setIsPiPActive(true);
      onPiPChange?.(true);
    } catch (e) {
      console.warn('PiP not available:', e);
    }
  }, [isPiPSupported, isPlaying, onPiPChange]);

  const exitPiP = useCallback(() => {
    setIsPiPActive(false);
    onPiPChange?.(false);
  }, [onPiPChange]);

  // Auto-enter PiP when app goes to background (if video is playing)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' && isPlaying && isPiPSupported) {
        enterPiP();
      } else if (state === 'active' && isPiPActive) {
        exitPiP();
      }
    });
    return () => subscription.remove();
  }, [isPlaying, isPiPActive, isPiPSupported]);

  return { isPiPActive, isPiPSupported, enterPiP, exitPiP };
}
```

**VideoPlayer.tsx modifications (~80 lines):**
```typescript
// Add to props interface:
enablePiP?: boolean;
onPiPEnter?: () => void;
onPiPExit?: () => void;

// Add PiP button to top controls bar (next to fullscreen):
{enablePiP && isPiPSupported && (
  <TouchableOpacity onPress={enterPiP} style={styles.controlButton}>
    <Icon name="layers" size="sm" color={colors.text.primary} />
  </TouchableOpacity>
)}

// Pass PiP props to expo-av Video:
<Video
  ref={videoRef}
  // ... existing props
  usePoster={!!thumbnailUrl}
  posterSource={thumbnailUrl ? { uri: thumbnailUrl } : undefined}
  // iOS PiP support:
  {...(Platform.OS === 'ios' && enablePiP ? {
    useNativeControls: isPiPActive,
  } : {})}
/>
```

**Store additions:**
```typescript
isPiPActive: boolean;
setIsPiPActive: (active: boolean) => void;
pipVideoId: string | null;
setPiPVideoId: (id: string | null) => void;
```

**i18n keys:**
```json
"pip": {
  "enter": "Picture-in-Picture",
  "exit": "Exit PiP",
  "notSupported": "PiP not supported on this device",
  "activeHint": "Video playing in picture-in-picture"
}
```

**~300 lines total**

---

## AGENT 4: Mini Player

**Creates:**
- `apps/mobile/src/components/ui/MiniPlayer.tsx`

**Modifies:**
- `apps/mobile/app/_layout.tsx` (render MiniPlayer above tab bar)
- `apps/mobile/app/(screens)/video/[id].tsx` (set mini player on back navigation)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Note:** Store already has `miniPlayerVideo`, `miniPlayerProgress`, `miniPlayerPlaying`, `closeMiniPlayer`.

**MiniPlayer.tsx (~350 lines):**
```tsx
import React, { useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Video, AVPlaybackStatus } from 'expo-av';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { useStore } from '../../store';
import { colors, spacing, radius, fontSize, animation } from '../../theme';
import { useHaptic } from '../../hooks/useHaptic';
import { useTranslation } from '../../hooks/useTranslation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MINI_HEIGHT = 64;
const PROGRESS_HEIGHT = 3;
const DISMISS_THRESHOLD = 150;

export function MiniPlayer() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();
  const videoRef = useRef<Video>(null);

  const miniPlayerVideo = useStore(s => s.miniPlayerVideo);
  const miniPlayerProgress = useStore(s => s.miniPlayerProgress);
  const isPlaying = useStore(s => s.miniPlayerPlaying);
  const setPlaying = useStore(s => s.setMiniPlayerPlaying);
  const setProgress = useStore(s => s.setMiniPlayerProgress);
  const closeMiniPlayer = useStore(s => s.closeMiniPlayer);

  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  // Show/hide animation
  const visible = !!miniPlayerVideo;
  const visibleAnim = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    visibleAnim.value = withSpring(visible ? 1 : 0, animation.spring.snappy);
  }, [visible]);

  // Swipe down to dismiss
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
        opacity.value = interpolate(e.translationY, [0, DISMISS_THRESHOLD], [1, 0], Extrapolation.CLAMP);
      }
      // Swipe horizontal to dismiss
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || Math.abs(e.translationX) > DISMISS_THRESHOLD) {
        translateY.value = withTiming(300, { duration: 200 });
        opacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(closeMiniPlayer)();
        });
        runOnJS(haptic)('light');
      } else {
        translateY.value = withSpring(0, animation.spring.responsive);
        translateX.value = withSpring(0, animation.spring.responsive);
        opacity.value = withSpring(1, animation.spring.responsive);
      }
    });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value + interpolate(visibleAnim.value, [0, 1], [MINI_HEIGHT + 20, 0]) },
      { translateX: translateX.value },
    ],
    opacity: opacity.value * visibleAnim.value,
    pointerEvents: visibleAnim.value > 0.5 ? 'auto' : 'none',
  }));

  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      const prog = status.positionMillis / (status.durationMillis || 1);
      setProgress(prog);
      if (status.didJustFinish) {
        setPlaying(false);
      }
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      videoRef.current?.pauseAsync();
    } else {
      videoRef.current?.playAsync();
    }
    setPlaying(!isPlaying);
    haptic('light');
  }, [isPlaying]);

  const handleExpand = useCallback(() => {
    if (!miniPlayerVideo) return;
    haptic('light');
    router.push(`/(screens)/video/${miniPlayerVideo.id}`);
    closeMiniPlayer();
  }, [miniPlayerVideo]);

  const handleClose = useCallback(() => {
    haptic('light');
    closeMiniPlayer();
  }, []);

  if (!miniPlayerVideo) return null;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.container, containerStyle]}>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[colors.emerald, colors.emeraldLight]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${miniPlayerProgress * 100}%` }]}
          />
        </View>

        <View style={[styles.content, isRTL && { flexDirection: 'row-reverse' }]}>
          {/* Thumbnail / Mini video */}
          <TouchableOpacity onPress={handleExpand} activeOpacity={0.8} style={styles.thumbnailWrap}>
            {miniPlayerVideo.thumbnailUri ? (
              <Image source={{ uri: miniPlayerVideo.thumbnailUri }} style={styles.thumbnail} />
            ) : (
              <View style={[styles.thumbnail, { backgroundColor: colors.dark.surface }]}>
                <Icon name="video" size="sm" color={colors.text.secondary} />
              </View>
            )}
            {/* Hidden video for audio continuity */}
            <Video
              ref={videoRef}
              source={{ uri: miniPlayerVideo.videoUrl }}
              shouldPlay={isPlaying}
              isLooping={false}
              volume={1}
              onPlaybackStatusUpdate={handlePlaybackStatus}
              style={{ width: 0, height: 0, position: 'absolute' }}
            />
          </TouchableOpacity>

          {/* Title + channel */}
          <TouchableOpacity onPress={handleExpand} style={styles.info} activeOpacity={0.8}>
            <Text style={styles.title} numberOfLines={1}>{miniPlayerVideo.title}</Text>
            <Text style={styles.channel} numberOfLines={1}>{miniPlayerVideo.channelName}</Text>
          </TouchableOpacity>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity onPress={togglePlayPause} hitSlop={8}
              accessibilityLabel={isPlaying ? t('pip.pause') : t('pip.play')}
              accessibilityRole="button">
              <Icon name={isPlaying ? 'pause' : 'play'} size="md" color={colors.text.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClose} hitSlop={8} style={{ marginLeft: spacing.md }}
              accessibilityLabel={t('common.close')} accessibilityRole="button">
              <Icon name="x" size="sm" color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 83, // tabBar.height
    left: 0,
    right: 0,
    height: MINI_HEIGHT + PROGRESS_HEIGHT,
    backgroundColor: colors.dark.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.dark.border,
    zIndex: 100,
  },
  progressTrack: {
    height: PROGRESS_HEIGHT,
    backgroundColor: colors.dark.surface,
  },
  progressFill: {
    height: PROGRESS_HEIGHT,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  thumbnailWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  channel: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
```

**`_layout.tsx` modification:**
```typescript
// Import MiniPlayer
import { MiniPlayer } from '../src/components/ui/MiniPlayer';

// Render after Stack, before closing tags:
<MiniPlayer />
```

**`video/[id].tsx` modification:**
When user presses back while video is playing, set mini player instead of stopping:
```typescript
// In navigation back handler:
const handleBack = () => {
  if (isPlaying && video) {
    useStore.getState().setMiniPlayerVideo({
      id: video.id,
      title: video.title,
      channelName: video.channel?.name || '',
      thumbnailUri: video.thumbnailUrl,
      videoUrl: video.hlsUrl || video.videoUrl,
    });
    useStore.getState().setMiniPlayerPlaying(true);
    useStore.getState().setMiniPlayerProgress(currentProgress);
  }
  router.back();
};
```

**i18n keys:**
```json
"miniPlayer": {
  "playing": "Now playing",
  "paused": "Paused",
  "swipeToDismiss": "Swipe down to dismiss"
}
```

**~450 lines total**

---

## AGENT 5: Video Premiere

**Creates:**
- `apps/api/src/modules/videos/dto/premiere.dto.ts`
- `apps/mobile/app/(screens)/video-premiere.tsx`
- `apps/mobile/src/components/ui/PremiereCountdown.tsx`

**Modifies:**
- `apps/api/src/modules/videos/videos.service.ts` (add premiere methods)
- `apps/api/src/modules/videos/videos.controller.ts` (add premiere endpoints)
- `apps/api/src/gateways/chat.gateway.ts` (add premiere chat room)
- `apps/mobile/src/services/api.ts` (add to videosApi)
- `apps/mobile/src/types/index.ts` (add Premiere types)
- `apps/mobile/app/(screens)/video/[id].tsx` (show premiere UI when active)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — `dto/premiere.dto.ts`:**
```typescript
import { IsDateString, IsBoolean, IsOptional, IsIn } from 'class-validator';

export class CreatePremiereDto {
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsBoolean() chatEnabled?: boolean;
  @IsOptional() @IsIn(['emerald', 'gold', 'cosmic']) countdownTheme?: string;
  @IsOptional() @IsString() trailerUrl?: string;
}

export class SetReminderDto {
  @IsString() premiereId: string;
}
```

**Backend — `videos.service.ts` — add methods:**
```typescript
async createPremiere(videoId: string, userId: string, dto: CreatePremiereDto) {
  const video = await this.prisma.video.findFirst({ where: { id: videoId, userId } });
  if (!video) throw new NotFoundException('Video not found');
  if (new Date(dto.scheduledAt) <= new Date()) throw new BadRequestException('Premiere must be in the future');

  const premiere = await this.prisma.videoPremiere.create({
    data: {
      videoId,
      scheduledAt: new Date(dto.scheduledAt),
      chatEnabled: dto.chatEnabled ?? true,
      countdownTheme: dto.countdownTheme || 'emerald',
      trailerUrl: dto.trailerUrl,
    },
  });

  await this.prisma.video.update({
    where: { id: videoId },
    data: { isPremiereEnabled: true, status: 'PUBLISHED', scheduledAt: new Date(dto.scheduledAt) },
  });

  return premiere;
}

async getPremiere(videoId: string) {
  const premiere = await this.prisma.videoPremiere.findUnique({
    where: { videoId },
    include: { video: { select: { title: true, thumbnailUrl: true, userId: true, channel: { select: { name: true, handle: true, avatarUrl: true } } } } },
  });
  if (!premiere) throw new NotFoundException();
  return premiere;
}

async setPremiereReminder(premiereId: string, userId: string) {
  await this.prisma.premiereReminder.create({
    data: { premiereId, userId },
  });
  await this.prisma.$executeRaw`UPDATE video_premieres SET "reminderCount" = "reminderCount" + 1 WHERE id = ${premiereId}`;
  return { success: true };
}

async removePremiereReminder(premiereId: string, userId: string) {
  await this.prisma.premiereReminder.delete({
    where: { premiereId_userId: { premiereId, userId } },
  });
  await this.prisma.$executeRaw`UPDATE video_premieres SET "reminderCount" = GREATEST("reminderCount" - 1, 0) WHERE id = ${premiereId}`;
  return { success: true };
}

async startPremiere(videoId: string, userId: string) {
  const video = await this.prisma.video.findFirst({ where: { id: videoId, userId } });
  if (!video) throw new NotFoundException();

  await this.prisma.videoPremiere.update({
    where: { videoId },
    data: { isLive: true },
  });

  // Notify all users who set reminders
  const reminders = await this.prisma.premiereReminder.findMany({
    where: { premiere: { videoId } },
    select: { userId: true },
  });

  for (const r of reminders) {
    await this.notificationsService.create({
      userId: r.userId,
      actorId: userId,
      type: 'VIDEO_PREMIERE',
      videoId,
      title: 'Premiere starting!',
      body: `${video.title} is premiering now`,
    });
  }

  return { success: true };
}

async getPremiereViewerCount(videoId: string) {
  const premiere = await this.prisma.videoPremiere.findUnique({ where: { videoId } });
  return { viewerCount: premiere?.viewerCount || 0 };
}
```

**Endpoints:**
```
POST   /videos/:id/premiere           (ClerkAuthGuard) — create premiere
GET    /videos/:id/premiere           (OptionalClerkAuthGuard) — get premiere info
POST   /videos/:id/premiere/reminder  (ClerkAuthGuard) — set reminder
DELETE /videos/:id/premiere/reminder  (ClerkAuthGuard) — remove reminder
POST   /videos/:id/premiere/start     (ClerkAuthGuard) — start premiere (owner)
GET    /videos/:id/premiere/viewers   (OptionalClerkAuthGuard) — viewer count
```

**PremiereCountdown.tsx (~200 lines):**
```tsx
// Animated countdown component:
// - Circular countdown ring (similar to CharCountRing but inverted)
// - Days : Hours : Minutes : Seconds in large monospace font
// - Pulsing emerald/gold glow animation
// - "Set Reminder" bell button (gold when active)
// - Viewer count badge (eye icon + count)
// - "Premiering in..." label
// - When countdown reaches 0: "LIVE NOW" pulsing badge
// - Theme variants: emerald (green glow), gold (warm glow), cosmic (purple glow)
```

**video-premiere.tsx (~400 lines):**
```
// Full premiere setup screen (creator flow):
// - GlassHeader: "Schedule Premiere"
// - Video preview card (thumbnail + title)
// - Date picker: calendar date selection
// - Time picker: hour/minute selection
// - Countdown theme selector (3 horizontal cards with preview)
// - Chat toggle: Enable live chat during countdown
// - Trailer clip option: attach short teaser (optional)
// - Preview of how premiere will look to viewers
// - GradientButton: "Schedule Premiere"
// - Confirmation with countdown preview
// - ScreenErrorBoundary
```

**video/[id].tsx modifications:**
```
// When video has isPremiereEnabled && premiere exists && premiere not yet started:
// - Replace video player with PremiereCountdown component
// - Show trailer clip if available
// - Live chat section below countdown (Socket.io room: `premiere:${videoId}`)
// - "Set Reminder" button
// - Viewer/waiting count
// When premiere starts (isLive = true): transition to normal video playback
```

**i18n keys:**
```json
"premiere": {
  "title": "Premiere",
  "schedule": "Schedule Premiere",
  "scheduledFor": "Premiering {{date}}",
  "countdown": "Premiering in",
  "days": "days",
  "hours": "hours",
  "minutes": "min",
  "seconds": "sec",
  "liveNow": "LIVE NOW",
  "setReminder": "Remind Me",
  "reminderSet": "Reminder set!",
  "removeReminder": "Remove Reminder",
  "viewers": "{{count}} waiting",
  "chatPlaceholder": "Chat before premiere...",
  "themeEmerald": "Emerald",
  "themeGold": "Gold",
  "themeCosmic": "Cosmic",
  "enableChat": "Live Chat",
  "enableChatHint": "Allow viewers to chat during countdown",
  "addTrailer": "Add Teaser Clip",
  "confirm": "Your video will premiere on {{date}} at {{time}}"
}
```

**~700 lines total**

---

## AGENT 6: Video Clip Sharing

**Creates:**
- `apps/api/src/modules/clips/clips.module.ts`
- `apps/api/src/modules/clips/clips.service.ts`
- `apps/api/src/modules/clips/clips.controller.ts`
- `apps/api/src/modules/clips/dto/create-clip.dto.ts`
- `apps/mobile/app/(screens)/create-clip.tsx`

**Modifies:**
- `apps/api/src/app.module.ts` (register ClipsModule)
- `apps/mobile/src/services/api.ts` (add clipsApi)
- `apps/mobile/src/types/index.ts` (add VideoClip type)
- `apps/mobile/src/components/ui/VideoPlayer.tsx` (add "Create Clip" button)
- `apps/mobile/app/(screens)/video/[id].tsx` (add clips section)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — `dto/create-clip.dto.ts`:**
```typescript
import { IsString, IsNumber, IsOptional, MaxLength, Min } from 'class-validator';

export class CreateClipDto {
  @IsNumber() @Min(0) startTime: number;
  @IsNumber() @Min(0.5) endTime: number;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
}
```

**Backend — `clips.service.ts`:**
```typescript
@Injectable()
export class ClipsService {
  constructor(
    private prisma: PrismaService,
    private streamService: StreamService,
  ) {}

  async create(userId: string, videoId: string, dto: CreateClipDto) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new NotFoundException('Video not found');
    if (video.status !== 'PUBLISHED') throw new ForbiddenException('Video not available');
    if (dto.endTime <= dto.startTime) throw new BadRequestException('End time must be after start time');
    if (dto.endTime - dto.startTime > 60) throw new BadRequestException('Clips can be max 60 seconds');
    if (dto.endTime > (video.duration || Infinity)) throw new BadRequestException('End time exceeds video duration');

    const duration = dto.endTime - dto.startTime;

    // Create clip record
    const clip = await this.prisma.videoClip.create({
      data: {
        userId,
        sourceVideoId: videoId,
        title: dto.title || `Clip from ${video.title}`,
        startTime: dto.startTime,
        endTime: dto.endTime,
        duration,
        // Cloudflare Stream supports clipping via API — request clip URL
        clipUrl: video.hlsUrl ? `${video.hlsUrl}?start=${dto.startTime}&end=${dto.endTime}` : null,
        thumbnailUrl: video.thumbnailUrl,
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        sourceVideo: { select: { id: true, title: true, thumbnailUrl: true, channel: { select: { name: true, handle: true } } } },
      },
    });

    return clip;
  }

  async getByVideo(videoId: string, cursor?: string, limit = 20) {
    const where: any = { sourceVideoId: videoId };
    if (cursor) where.id = { lt: cursor };

    const clips = await this.prisma.videoClip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      },
    });

    const hasMore = clips.length > limit;
    if (hasMore) clips.pop();

    return {
      data: clips,
      meta: { cursor: clips[clips.length - 1]?.id || null, hasMore },
    };
  }

  async getByUser(userId: string, cursor?: string, limit = 20) {
    const where: any = { userId };
    if (cursor) where.id = { lt: cursor };

    const clips = await this.prisma.videoClip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        sourceVideo: { select: { id: true, title: true, thumbnailUrl: true, duration: true } },
      },
    });

    const hasMore = clips.length > limit;
    if (hasMore) clips.pop();

    return {
      data: clips,
      meta: { cursor: clips[clips.length - 1]?.id || null, hasMore },
    };
  }

  async delete(clipId: string, userId: string) {
    const clip = await this.prisma.videoClip.findFirst({ where: { id: clipId, userId } });
    if (!clip) throw new NotFoundException();
    return this.prisma.videoClip.delete({ where: { id: clipId } });
  }

  async getShareLink(clipId: string) {
    const clip = await this.prisma.videoClip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException();
    return { url: `https://mizanly.app/video/${clip.sourceVideoId}?t=${clip.startTime}` };
  }
}
```

**Controller endpoints:**
```
POST   /clips/video/:videoId     (ClerkAuthGuard) — create clip
GET    /clips/video/:videoId     (OptionalClerkAuthGuard) — get clips for video
GET    /clips/me                 (ClerkAuthGuard) — get my clips
DELETE /clips/:id                (ClerkAuthGuard) — delete clip
GET    /clips/:id/share          (OptionalClerkAuthGuard) — get share link
```

**Mobile — `create-clip.tsx` (~400 lines):**
```
// Full clip creation screen:
// - GlassHeader: "Create Clip" with source video title
// - Video preview player with current clip range highlighted
// - Timeline scrubber:
//   - Full video timeline with frame thumbnails (generated from video)
//   - Two draggable handles: start (emerald) and end (gold)
//   - Selected range highlighted with emerald tint
//   - Time labels: "00:32 — 01:15 (43s)"
//   - Max clip duration indicator (60s)
//   - Haptic feedback on handle drag
// - Clip preview: play button to preview the selected range
// - Title input (TextInput + CharCountRing, max 100)
// - Info card: "Clips can be up to 60 seconds"
// - Source video attribution card (thumbnail + title + channel)
// - GradientButton: "Create Clip"
// - ScreenErrorBoundary

// Timeline uses PanGestureHandler for handles:
const startHandle = useSharedValue(0);
const endHandle = useSharedValue(duration > 60 ? 60 / duration : 1);
// Handle clamping: min gap 0.5s, max gap 60s, within 0-duration range
```

**VideoPlayer.tsx modification:**
Add "scissors" icon button to controls bar that navigates to create-clip:
```typescript
// In top controls:
{showClipButton && (
  <TouchableOpacity onPress={() => router.push({
    pathname: '/(screens)/create-clip',
    params: { videoId, currentTime: position.toString(), duration: duration.toString() }
  })}>
    <Icon name="scissors" size="sm" color={colors.text.primary} />
  </TouchableOpacity>
)}
```

**i18n keys:**
```json
"clips": {
  "title": "Create Clip",
  "myClips": "My Clips",
  "clipTitle": "Clip Title",
  "titlePlaceholder": "Give your clip a title...",
  "from": "From",
  "duration": "Duration",
  "maxDuration": "Clips can be up to 60 seconds",
  "preview": "Preview Clip",
  "create": "Create Clip",
  "creating": "Creating clip...",
  "created": "Clip created!",
  "delete": "Delete Clip",
  "deleteConfirm": "Delete this clip?",
  "share": "Share Clip",
  "copyLink": "Copy Link",
  "viewSource": "View Full Video",
  "clipsCount": "{{count}} clips",
  "noClips": "No clips yet",
  "noClipsSubtitle": "Create clips from your favorite moments"
}
```

**~600 lines total**

---

## AGENT 7: Ambient Mode

**Creates:**
- `apps/mobile/src/hooks/useAmbientColor.ts`

**Modifies:**
- `apps/mobile/app/(screens)/video/[id].tsx` (add ambient background)
- `apps/mobile/app/(screens)/reel/[id].tsx` (add ambient background)
- `apps/mobile/src/store/index.ts` (add ambientModeEnabled)
- `apps/mobile/src/components/ui/VideoPlayer.tsx` (add ambient toggle)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Hook — `useAmbientColor.ts` (~80 lines):**
```typescript
import { useState, useEffect } from 'react';
import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Extracts dominant color from an image by sampling a tiny version
export function useAmbientColor(imageUri: string | undefined | null) {
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const [secondaryColor, setSecondaryColor] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUri) {
      setDominantColor(null);
      return;
    }

    let cancelled = false;

    async function extractColor() {
      try {
        // Resize to 1x1 pixel to get average color
        const result = await manipulateAsync(
          imageUri!,
          [{ resize: { width: 4, height: 4 } }],
          { format: SaveFormat.PNG, base64: true }
        );

        if (cancelled || !result.base64) return;

        // Parse PNG base64 to extract pixel color
        // Simple approach: use the average of the tiny image
        // For a more accurate approach, decode the PNG data
        // Fallback: use a muted version of emerald based on image brightness
        const bytes = atob(result.base64);

        // PNG has IHDR at offset 8, IDAT chunks with pixel data
        // For a 4x4 image, extract raw pixel colors from the data
        // Simplified: just use a hash of the base64 to generate consistent colors
        const hash = result.base64.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
        const hue = Math.abs(hash % 360);
        const saturation = 30 + Math.abs((hash >> 8) % 20); // 30-50% saturation (muted)
        const lightness = 15 + Math.abs((hash >> 16) % 10); // 15-25% lightness (dark)

        if (!cancelled) {
          setDominantColor(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
          setSecondaryColor(`hsl(${(hue + 30) % 360}, ${saturation - 10}%, ${lightness + 5}%)`);
        }
      } catch {
        if (!cancelled) {
          setDominantColor(null);
          setSecondaryColor(null);
        }
      }
    }

    extractColor();
    return () => { cancelled = true; };
  }, [imageUri]);

  return { dominantColor, secondaryColor };
}
```

**Video screen modifications — ambient background:**
```tsx
// In video/[id].tsx, wrap content in ambient gradient:
const { dominantColor, secondaryColor } = useAmbientColor(
  ambientModeEnabled ? video?.thumbnailUrl : null
);

// Behind the video player:
{ambientModeEnabled && dominantColor && (
  <Animated.View
    entering={FadeIn.duration(800)}
    style={[StyleSheet.absoluteFill, { zIndex: -1 }]}
  >
    <LinearGradient
      colors={[
        dominantColor,
        secondaryColor || colors.dark.bg,
        colors.dark.bg,
      ]}
      locations={[0, 0.4, 0.7]}
      style={StyleSheet.absoluteFill}
    />
  </Animated.View>
)}
```

**VideoPlayer.tsx — add ambient toggle in quality/speed sheet:**
```tsx
// Add to settings BottomSheet:
<BottomSheetItem
  label={t('ambient.toggle')}
  icon={<Icon name="sun" size="sm" color={ambientEnabled ? colors.gold : colors.text.secondary} />}
  onPress={() => {
    setAmbientEnabled(!ambientEnabled);
    haptic('light');
  }}
  rightElement={
    <View style={[styles.ambientDot, ambientEnabled && { backgroundColor: colors.gold }]} />
  }
/>
```

**Store addition:**
```typescript
ambientModeEnabled: boolean;
setAmbientModeEnabled: (enabled: boolean) => void;
// Persist to AsyncStorage
```

**i18n keys:**
```json
"ambient": {
  "toggle": "Ambient Mode",
  "on": "Ambient mode on",
  "off": "Ambient mode off",
  "hint": "Background color matches the video"
}
```

**~300 lines total**

---

## AGENT 8: End Screens

**Creates:**
- `apps/api/src/modules/videos/dto/end-screen.dto.ts`
- `apps/mobile/app/(screens)/end-screen-editor.tsx`
- `apps/mobile/src/components/ui/EndScreenOverlay.tsx`

**Modifies:**
- `apps/api/src/modules/videos/videos.service.ts` (add end screen CRUD)
- `apps/api/src/modules/videos/videos.controller.ts` (add endpoints)
- `apps/mobile/src/services/api.ts` (add to videosApi)
- `apps/mobile/src/types/index.ts` (add EndScreen type)
- `apps/mobile/src/components/ui/VideoPlayer.tsx` (render end screens)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — `dto/end-screen.dto.ts`:**
```typescript
import { IsString, IsOptional, IsIn, IsNumber, MaxLength, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class EndScreenItemDto {
  @IsIn(['subscribe', 'watch_next', 'playlist', 'link']) type: string;
  @IsOptional() @IsString() targetId?: string;
  @IsString() @MaxLength(60) label: string;
  @IsOptional() @IsString() url?: string;
  @IsIn(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center-left', 'center-right'])
  position: string;
  @IsNumber() @Min(5) @Max(30) showAtSeconds: number;
}

export class SetEndScreensDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => EndScreenItemDto)
  items: EndScreenItemDto[];
}
```

**Backend — `videos.service.ts` — add methods:**
```typescript
async setEndScreens(videoId: string, userId: string, dto: SetEndScreensDto) {
  const video = await this.prisma.video.findFirst({ where: { id: videoId, userId } });
  if (!video) throw new NotFoundException();
  if (dto.items.length > 4) throw new BadRequestException('Maximum 4 end screen items');

  // Validate targets exist
  for (const item of dto.items) {
    if (item.type === 'watch_next' && item.targetId) {
      const target = await this.prisma.video.findUnique({ where: { id: item.targetId } });
      if (!target) throw new BadRequestException(`Video ${item.targetId} not found`);
    }
    if (item.type === 'playlist' && item.targetId) {
      const target = await this.prisma.playlist.findUnique({ where: { id: item.targetId } });
      if (!target) throw new BadRequestException(`Playlist ${item.targetId} not found`);
    }
  }

  // Delete existing end screens and replace
  await this.prisma.endScreen.deleteMany({ where: { videoId } });

  const endScreens = await Promise.all(
    dto.items.map(item =>
      this.prisma.endScreen.create({
        data: { videoId, ...item },
      })
    )
  );

  return endScreens;
}

async getEndScreens(videoId: string) {
  return this.prisma.endScreen.findMany({
    where: { videoId },
    orderBy: { showAtSeconds: 'desc' },
  });
}

async deleteEndScreens(videoId: string, userId: string) {
  const video = await this.prisma.video.findFirst({ where: { id: videoId, userId } });
  if (!video) throw new NotFoundException();
  await this.prisma.endScreen.deleteMany({ where: { videoId } });
  return { success: true };
}
```

**Endpoints:**
```
PUT    /videos/:id/end-screens  (ClerkAuthGuard) — set end screens (replace all)
GET    /videos/:id/end-screens  (OptionalClerkAuthGuard) — get end screens
DELETE /videos/:id/end-screens  (ClerkAuthGuard) — remove all end screens
```

**EndScreenOverlay.tsx (~200 lines):**
```tsx
// Renders end screen cards as animated overlays on video player
// - Appears when video reaches (duration - showAtSeconds)
// - Card types:
//   subscribe: Channel avatar + "Subscribe" button (emerald gradient)
//   watch_next: Video thumbnail + title card (glassmorphism)
//   playlist: Playlist icon + title + video count
//   link: Globe icon + label + URL preview
// - Position system maps to screen quadrants
// - Entry animation: FadeInUp with stagger
// - Exit animation: FadeOutDown when tapped or video replays
// - Cards are Pressable: navigate to target on tap
// - Semi-transparent glass background
// - Close button per card (x icon, top-right)
```

**end-screen-editor.tsx (~400 lines):**
```
// End screen editor for creators:
// - GlassHeader: "End Screens" + video title
// - Video thumbnail preview with grid overlay showing positions
// - "Add End Screen" button (max 4)
// - For each item:
//   - Type selector: 4 icon buttons (subscribe/video/playlist/link)
//   - Position selector: visual 6-position grid
//   - Label input (max 60 chars) with CharCountRing
//   - Target picker (BottomSheet):
//     - subscribe: auto (uses video's channel)
//     - watch_next: search/select from channel videos
//     - playlist: select from channel playlists
//     - link: URL input
//   - Timing: slider for showAtSeconds (5-30 seconds before end)
//   - Delete item button
// - Preview button: simulate end screen on video player
// - GradientButton: "Save End Screens"
// - ScreenErrorBoundary
```

**i18n keys:**
```json
"endScreens": {
  "title": "End Screens",
  "add": "Add End Screen",
  "maxReached": "Maximum 4 end screens",
  "subscribe": "Subscribe",
  "watchNext": "Watch Next",
  "playlist": "Playlist",
  "link": "Link",
  "label": "Label",
  "labelPlaceholder": "Button text...",
  "position": "Position",
  "timing": "Show at",
  "secondsBefore": "{{seconds}}s before end",
  "selectVideo": "Select Video",
  "selectPlaylist": "Select Playlist",
  "enterUrl": "Enter URL",
  "preview": "Preview",
  "save": "Save End Screens",
  "saved": "End screens saved!",
  "delete": "Remove",
  "deleteAll": "Remove All"
}
```

**~500 lines total**

---

## AGENT 9: Collaborative Playlists

**Creates:**
- `apps/api/src/modules/playlists/dto/collaborator.dto.ts`

**Modifies:**
- `apps/api/src/modules/playlists/playlists.service.ts` (add collab methods)
- `apps/api/src/modules/playlists/playlists.controller.ts` (add endpoints)
- `apps/mobile/src/services/api.ts` (add to playlistsApi)
- `apps/mobile/src/types/index.ts` (extend Playlist type)
- `apps/mobile/app/(screens)/playlist-detail.tsx` or equivalent (add collaborator UI)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — `dto/collaborator.dto.ts`:**
```typescript
import { IsString, IsIn, IsOptional } from 'class-validator';

export class AddCollaboratorDto {
  @IsString() userId: string;
  @IsOptional() @IsIn(['editor', 'viewer']) role?: string;
}

export class UpdateCollaboratorDto {
  @IsIn(['editor', 'viewer']) role: string;
}
```

**Backend — `playlists.service.ts` — add methods:**
```typescript
async toggleCollaborative(playlistId: string, userId: string) {
  const playlist = await this.prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { channel: true },
  });
  if (!playlist) throw new NotFoundException();
  if (playlist.channel.userId !== userId) throw new ForbiddenException();

  return this.prisma.playlist.update({
    where: { id: playlistId },
    data: { isCollaborative: !playlist.isCollaborative },
  });
}

async addCollaborator(playlistId: string, userId: string, dto: AddCollaboratorDto) {
  const playlist = await this.prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { channel: true },
  });
  if (!playlist) throw new NotFoundException();
  if (playlist.channel.userId !== userId) throw new ForbiddenException();
  if (!playlist.isCollaborative) throw new BadRequestException('Playlist is not collaborative');
  if (dto.userId === userId) throw new BadRequestException('Cannot add yourself');

  // Verify target user exists
  const targetUser = await this.prisma.user.findUnique({ where: { id: dto.userId } });
  if (!targetUser) throw new NotFoundException('User not found');

  return this.prisma.playlistCollaborator.create({
    data: {
      playlistId,
      userId: dto.userId,
      role: dto.role || 'editor',
      addedById: userId,
    },
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
    },
  });
}

async removeCollaborator(playlistId: string, userId: string, collaboratorUserId: string) {
  const playlist = await this.prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { channel: true },
  });
  if (!playlist) throw new NotFoundException();
  // Owner or self-removal
  if (playlist.channel.userId !== userId && collaboratorUserId !== userId) {
    throw new ForbiddenException();
  }

  return this.prisma.playlistCollaborator.delete({
    where: { playlistId_userId: { playlistId, userId: collaboratorUserId } },
  });
}

async getCollaborators(playlistId: string) {
  return this.prisma.playlistCollaborator.findMany({
    where: { playlistId },
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
    },
    orderBy: { addedAt: 'asc' },
  });
}

async updateCollaboratorRole(playlistId: string, userId: string, collaboratorUserId: string, role: string) {
  const playlist = await this.prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { channel: true },
  });
  if (!playlist) throw new NotFoundException();
  if (playlist.channel.userId !== userId) throw new ForbiddenException();

  return this.prisma.playlistCollaborator.update({
    where: { playlistId_userId: { playlistId, userId: collaboratorUserId } },
    data: { role },
  });
}

// Modify existing addItem to check collaborative permissions:
async addItem(playlistId: string, videoId: string, userId: string) {
  const playlist = await this.prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { channel: true, collaborators: true },
  });
  if (!playlist) throw new NotFoundException();

  // Allow owner OR editor collaborators
  const isOwner = playlist.channel.userId === userId;
  const isEditor = playlist.collaborators.some(c => c.userId === userId && c.role === 'editor');
  if (!isOwner && !isEditor) throw new ForbiddenException();

  // ... rest of existing addItem logic
}
```

**New endpoints:**
```
POST   /playlists/:id/collaborative           (ClerkAuthGuard) — toggle collaborative
POST   /playlists/:id/collaborators            (ClerkAuthGuard) — add collaborator
DELETE /playlists/:id/collaborators/:userId     (ClerkAuthGuard) — remove collaborator
GET    /playlists/:id/collaborators            (OptionalClerkAuthGuard) — list collaborators
PATCH  /playlists/:id/collaborators/:userId    (ClerkAuthGuard) — update role
```

**Mobile — playlist detail modifications (~250 lines):**
```
// Add to playlist detail screen:
// - "Collaborative" toggle (owner only) with gold icon
// - When collaborative:
//   - "Collaborators" section header with count badge
//   - Horizontal scroll of collaborator avatars (Avatar component)
//   - "Invite" button → search users BottomSheet
//   - Each collaborator: avatar + name + role badge (editor/viewer)
//   - Long-press collaborator: BottomSheet with Change Role / Remove
// - Non-owner collaborators see "Leave Playlist" option
// - Collaborative badge on playlist card (users icon + gold border)
// - Activity indicator: "Added by @username" on playlist items
```

**i18n keys:**
```json
"collabPlaylist": {
  "collaborative": "Collaborative Playlist",
  "collaborativeHint": "Let others add videos to this playlist",
  "collaborators": "Collaborators",
  "invite": "Invite",
  "invitePlaceholder": "Search by username...",
  "editor": "Editor",
  "viewer": "Viewer",
  "changeRole": "Change Role",
  "remove": "Remove",
  "removeConfirm": "Remove {{name}} from playlist?",
  "leave": "Leave Playlist",
  "leaveConfirm": "Leave this collaborative playlist?",
  "addedBy": "Added by {{name}}",
  "noCollaborators": "No collaborators yet",
  "noCollaboratorsSubtitle": "Invite friends to add videos together"
}
```

**~400 lines total**

---

## AGENT 10: Channel Trailer

**Creates:**
- `apps/api/src/modules/channels/dto/trailer.dto.ts`

**Modifies:**
- `apps/api/src/modules/channels/channels.service.ts` (add trailer methods)
- `apps/api/src/modules/channels/channels.controller.ts` (add endpoints)
- `apps/mobile/src/services/api.ts` (add to channelsApi)
- `apps/mobile/app/(screens)/channel/[handle].tsx` (show trailer for non-subs)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — `dto/trailer.dto.ts`:**
```typescript
import { IsString, IsOptional } from 'class-validator';

export class SetTrailerDto {
  @IsString() videoId: string;
}
```

**Backend — `channels.service.ts` — add methods:**
```typescript
async setTrailer(handle: string, userId: string, dto: SetTrailerDto) {
  const channel = await this.prisma.channel.findUnique({ where: { handle } });
  if (!channel) throw new NotFoundException();
  if (channel.userId !== userId) throw new ForbiddenException();

  // Verify the video belongs to this channel
  const video = await this.prisma.video.findFirst({
    where: { id: dto.videoId, channelId: channel.id },
  });
  if (!video) throw new BadRequestException('Video must belong to your channel');

  return this.prisma.channel.update({
    where: { handle },
    data: { trailerVideoId: dto.videoId },
  });
}

async removeTrailer(handle: string, userId: string) {
  const channel = await this.prisma.channel.findUnique({ where: { handle } });
  if (!channel) throw new NotFoundException();
  if (channel.userId !== userId) throw new ForbiddenException();

  return this.prisma.channel.update({
    where: { handle },
    data: { trailerVideoId: null },
  });
}

// Modify getByHandle to include trailer:
async getByHandle(handle: string, userId?: string) {
  const channel = await this.prisma.channel.findUnique({
    where: { handle },
    include: {
      trailerVideo: {
        select: { id: true, title: true, thumbnailUrl: true, hlsUrl: true, videoUrl: true, duration: true },
      },
    },
  });
  // ... rest of existing logic, add isSubscribed check
  // Return trailerVideo only for non-subscribers
}
```

**Endpoints:**
```
PUT    /channels/:handle/trailer   (ClerkAuthGuard) — set trailer video
DELETE /channels/:handle/trailer   (ClerkAuthGuard) — remove trailer
```

**Mobile — `channel/[handle].tsx` modifications (~200 lines):**
```
// When channel has trailerVideo AND user is NOT subscribed:
// - Show "Channel Trailer" section above tabs
// - Auto-playing trailer video (muted, with unmute button)
// - Gradient overlay with channel name + "Watch Trailer" CTA
// - "Subscribe to unlock all content" message below trailer
// - Glassmorphism card styling

// When user IS subscribed:
// - Hide trailer section
// - Show regular content

// Channel settings (owner view):
// - "Set Channel Trailer" in channel menu BottomSheet
// - Opens video picker (list of channel's videos)
// - Selected video preview with "Remove Trailer" option
```

**i18n keys:**
```json
"channelTrailer": {
  "title": "Channel Trailer",
  "watchTrailer": "Watch Trailer",
  "subscribeToUnlock": "Subscribe to unlock all content",
  "setTrailer": "Set Channel Trailer",
  "removeTrailer": "Remove Trailer",
  "selectVideo": "Select a video as your channel trailer",
  "currentTrailer": "Current Trailer",
  "noTrailer": "No trailer set",
  "trailerHint": "Non-subscribers will see this video on your channel"
}
```

**~300 lines total**

---

## AGENT 11: Home Screen Widgets

**Creates:**
- `apps/mobile/plugins/widgets/app.plugin.js` (Expo config plugin)
- `apps/mobile/plugins/widgets/android/PrayerTimesWidget.kt`
- `apps/mobile/plugins/widgets/android/UnreadWidget.kt`
- `apps/mobile/plugins/widgets/ios/PrayerTimesWidget.swift`
- `apps/mobile/plugins/widgets/ios/UnreadWidget.swift`
- `apps/mobile/src/services/widgetData.ts`

**Modifies:**
- `apps/mobile/app.json` (add widget plugin)
- `apps/mobile/app/_layout.tsx` (sync widget data on foreground)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Widget Data Service — `widgetData.ts` (~120 lines):**
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';

interface PrayerTimesWidgetData {
  nextPrayer: string; // "Asr"
  nextPrayerTime: string; // "15:32"
  remainingMinutes: number;
  location: string; // "Melbourne"
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

interface UnreadWidgetData {
  unreadMessages: number;
  unreadNotifications: number;
  userName: string;
  avatarUrl: string;
}

const PRAYER_KEY = 'widget_prayer_data';
const UNREAD_KEY = 'widget_unread_data';

export const widgetData = {
  async updatePrayerTimes(data: PrayerTimesWidgetData) {
    await AsyncStorage.setItem(PRAYER_KEY, JSON.stringify(data));
    // Push to native widget via shared UserDefaults (iOS) or SharedPreferences (Android)
    if (Platform.OS === 'ios') {
      NativeModules.WidgetModule?.updatePrayerWidget?.(JSON.stringify(data));
    } else if (Platform.OS === 'android') {
      NativeModules.WidgetModule?.updatePrayerWidget?.(JSON.stringify(data));
    }
  },

  async updateUnreadCounts(data: UnreadWidgetData) {
    await AsyncStorage.setItem(UNREAD_KEY, JSON.stringify(data));
    if (Platform.OS === 'ios') {
      NativeModules.WidgetModule?.updateUnreadWidget?.(JSON.stringify(data));
    } else if (Platform.OS === 'android') {
      NativeModules.WidgetModule?.updateUnreadWidget?.(JSON.stringify(data));
    }
  },

  async getPrayerTimes(): Promise<PrayerTimesWidgetData | null> {
    const raw = await AsyncStorage.getItem(PRAYER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  async getUnreadCounts(): Promise<UnreadWidgetData | null> {
    const raw = await AsyncStorage.getItem(UNREAD_KEY);
    return raw ? JSON.parse(raw) : null;
  },
};
```

**Expo Config Plugin — `plugins/widgets/app.plugin.js` (~100 lines):**
```javascript
const { withAndroidManifest, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

module.exports = function withWidgets(config) {
  // Android: Register widget providers in AndroidManifest
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    if (!app.receiver) app.receiver = [];

    // Prayer Times Widget
    app.receiver.push({
      $: {
        'android:name': '.PrayerTimesWidget',
        'android:exported': 'true',
        'android:label': 'Prayer Times',
      },
      'intent-filter': [{
        action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
      }],
      'meta-data': [{
        $: {
          'android:name': 'android.appwidget.provider',
          'android:resource': '@xml/prayer_times_widget_info',
        },
      }],
    });

    // Unread Count Widget
    app.receiver.push({
      $: {
        'android:name': '.UnreadWidget',
        'android:exported': 'true',
        'android:label': 'Mizanly Unread',
      },
      'intent-filter': [{
        action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
      }],
      'meta-data': [{
        $: {
          'android:name': 'android.appwidget.provider',
          'android:resource': '@xml/unread_widget_info',
        },
      }],
    });

    return config;
  });

  // iOS: Register WidgetKit extension
  config = withInfoPlist(config, (config) => {
    config.modResults.NSWidgetWantsLocation = true;
    return config;
  });

  return config;
};
```

**Native Widget Files:**
Android and iOS widget implementations follow platform patterns:
- **Android**: Kotlin AppWidgetProvider subclass + XML layout + update logic reading SharedPreferences
- **iOS**: SwiftUI WidgetKit Timeline Provider reading UserDefaults (app group)

Both widgets:
1. **Prayer Times** (medium/large): Next prayer name + countdown, all 5 prayer times listed, mosque icon, emerald accent
2. **Unread Counts** (small): App icon + unread message badge + notification badge, tap opens app

**`_layout.tsx` — sync widget data:**
```typescript
// In AppStateHandler, when app comes to foreground:
useEffect(() => {
  const subscription = AppState.addEventListener('change', async (state) => {
    if (state === 'active') {
      // Sync widget data
      const unread = useStore.getState();
      widgetData.updateUnreadCounts({
        unreadMessages: unread.unreadMessages,
        unreadNotifications: unread.unreadNotifications,
        userName: unread.user?.displayName || '',
        avatarUrl: unread.user?.avatarUrl || '',
      });
    }
  });
  return () => subscription.remove();
}, []);
```

**i18n keys:**
```json
"widgets": {
  "prayerTimes": "Prayer Times",
  "prayerTimesDesc": "Shows next prayer time with countdown",
  "unread": "Unread",
  "unreadDesc": "Shows unread message and notification counts",
  "setupHint": "Add widgets from your home screen settings",
  "nextPrayer": "Next: {{prayer}}",
  "minutesRemaining": "{{minutes}} min"
}
```

**~700 lines total** (including native widget files)

---

## AGENT 12: Parental Controls

**Creates:**
- `apps/api/src/modules/parental-controls/parental-controls.module.ts`
- `apps/api/src/modules/parental-controls/parental-controls.service.ts`
- `apps/api/src/modules/parental-controls/parental-controls.controller.ts`
- `apps/api/src/modules/parental-controls/dto/parental-control.dto.ts`
- `apps/mobile/app/(screens)/parental-controls.tsx`
- `apps/mobile/app/(screens)/link-child-account.tsx`

**Modifies:**
- `apps/api/src/app.module.ts` (register ParentalControlsModule)
- `apps/mobile/src/services/api.ts` (add parentalApi)
- `apps/mobile/src/types/index.ts` (add ParentalControl type)
- `apps/mobile/src/store/index.ts` (add isChildAccount, parentalRestrictions)
- `apps/mobile/app/(screens)/settings.tsx` (add "Parental Controls" row)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — `dto/parental-control.dto.ts`:**
```typescript
import { IsString, IsBoolean, IsOptional, IsInt, IsIn, Min, Max, Length } from 'class-validator';

export class LinkChildDto {
  @IsString() childUserId: string;
  @IsString() @Length(4, 4) pin: string; // 4-digit PIN
}

export class UpdateParentalControlDto {
  @IsOptional() @IsBoolean() restrictedMode?: boolean;
  @IsOptional() @IsIn(['G', 'PG', 'PG13', 'R']) maxAgeRating?: string;
  @IsOptional() @IsInt() @Min(15) @Max(480) dailyLimitMinutes?: number;
  @IsOptional() @IsIn(['none', 'contacts_only', 'disabled']) dmRestriction?: string;
  @IsOptional() @IsBoolean() canGoLive?: boolean;
  @IsOptional() @IsBoolean() canPost?: boolean;
  @IsOptional() @IsBoolean() canComment?: boolean;
  @IsOptional() @IsBoolean() activityDigest?: boolean;
}

export class VerifyPinDto {
  @IsString() @Length(4, 4) pin: string;
}

export class ChangePinDto {
  @IsString() @Length(4, 4) currentPin: string;
  @IsString() @Length(4, 4) newPin: string;
}
```

**Backend — `parental-controls.service.ts`:**
```typescript
import * as bcrypt from 'bcrypt';

@Injectable()
export class ParentalControlsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async linkChild(parentUserId: string, dto: LinkChildDto) {
    if (parentUserId === dto.childUserId) throw new BadRequestException('Cannot link yourself');

    // Check child isn't already linked
    const existing = await this.prisma.parentalControl.findUnique({
      where: { childUserId: dto.childUserId },
    });
    if (existing) throw new ConflictException('This account is already linked to a parent');

    // Check parent isn't a child account
    const parentCheck = await this.prisma.parentalControl.findUnique({
      where: { childUserId: parentUserId },
    });
    if (parentCheck) throw new BadRequestException('Child accounts cannot be parents');

    const pinHash = await bcrypt.hash(dto.pin, 10);

    const control = await this.prisma.parentalControl.create({
      data: {
        parentUserId,
        childUserId: dto.childUserId,
        pin: pinHash,
      },
      include: {
        child: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    // Mark child account
    await this.prisma.user.update({
      where: { id: dto.childUserId },
      data: { isChildAccount: true },
    });

    return control;
  }

  async unlinkChild(parentUserId: string, childUserId: string, pin: string) {
    const control = await this.prisma.parentalControl.findFirst({
      where: { parentUserId, childUserId },
    });
    if (!control) throw new NotFoundException();

    const validPin = await bcrypt.compare(pin, control.pin);
    if (!validPin) throw new ForbiddenException('Invalid PIN');

    await this.prisma.parentalControl.delete({ where: { id: control.id } });
    await this.prisma.user.update({
      where: { id: childUserId },
      data: { isChildAccount: false },
    });

    return { success: true };
  }

  async getMyChildren(parentUserId: string) {
    return this.prisma.parentalControl.findMany({
      where: { parentUserId },
      include: {
        child: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async getParentInfo(childUserId: string) {
    return this.prisma.parentalControl.findUnique({
      where: { childUserId },
      include: {
        parent: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async updateControls(parentUserId: string, childUserId: string, dto: UpdateParentalControlDto) {
    const control = await this.prisma.parentalControl.findFirst({
      where: { parentUserId, childUserId },
    });
    if (!control) throw new NotFoundException();

    return this.prisma.parentalControl.update({
      where: { id: control.id },
      data: dto,
    });
  }

  async verifyPin(parentUserId: string, childUserId: string, pin: string) {
    const control = await this.prisma.parentalControl.findFirst({
      where: { parentUserId, childUserId },
    });
    if (!control) throw new NotFoundException();

    const valid = await bcrypt.compare(pin, control.pin);
    if (!valid) throw new ForbiddenException('Invalid PIN');
    return { valid: true };
  }

  async changePin(parentUserId: string, childUserId: string, currentPin: string, newPin: string) {
    const control = await this.prisma.parentalControl.findFirst({
      where: { parentUserId, childUserId },
    });
    if (!control) throw new NotFoundException();

    const valid = await bcrypt.compare(currentPin, control.pin);
    if (!valid) throw new ForbiddenException('Invalid current PIN');

    const newHash = await bcrypt.hash(newPin, 10);
    return this.prisma.parentalControl.update({
      where: { id: control.id },
      data: { pin: newHash },
    });
  }

  async getRestrictions(childUserId: string) {
    const control = await this.prisma.parentalControl.findUnique({
      where: { childUserId },
    });
    if (!control) return null; // Not a child account
    return {
      restrictedMode: control.restrictedMode,
      maxAgeRating: control.maxAgeRating,
      dailyLimitMinutes: control.dailyLimitMinutes,
      dmRestriction: control.dmRestriction,
      canGoLive: control.canGoLive,
      canPost: control.canPost,
      canComment: control.canComment,
    };
  }

  async getActivityDigest(parentUserId: string, childUserId: string) {
    const control = await this.prisma.parentalControl.findFirst({
      where: { parentUserId, childUserId },
    });
    if (!control) throw new NotFoundException();

    // Get child's activity for the past 7 days
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [posts, screenTime, messages] = await Promise.all([
      this.prisma.post.count({ where: { userId: childUserId, createdAt: { gte: since } } }),
      this.prisma.screenTimeLog.findMany({
        where: { userId: childUserId, date: { gte: since } },
        orderBy: { date: 'desc' },
      }),
      this.prisma.message.count({ where: { senderId: childUserId, createdAt: { gte: since } } }),
    ]);

    const totalScreenTimeMinutes = screenTime.reduce((sum, s) => sum + Math.floor(s.totalSeconds / 60), 0);
    const avgDailyMinutes = Math.floor(totalScreenTimeMinutes / 7);

    return {
      period: { from: since, to: new Date() },
      postsCreated: posts,
      messagesSent: messages,
      totalScreenTimeMinutes,
      avgDailyMinutes,
      dailyBreakdown: screenTime.map(s => ({
        date: s.date,
        minutes: Math.floor(s.totalSeconds / 60),
        sessions: s.sessions,
      })),
    };
  }
}
```

**Controller endpoints:**
```
POST   /parental-controls/link          (ClerkAuthGuard) — link child account
DELETE /parental-controls/link/:childId  (ClerkAuthGuard) — unlink child (requires PIN)
GET    /parental-controls/children       (ClerkAuthGuard) — get my children
GET    /parental-controls/parent         (ClerkAuthGuard) — get my parent (child view)
PATCH  /parental-controls/:childId       (ClerkAuthGuard) — update controls
POST   /parental-controls/:childId/pin   (ClerkAuthGuard) — verify PIN
PATCH  /parental-controls/:childId/pin   (ClerkAuthGuard) — change PIN
GET    /parental-controls/:childId/restrictions (ClerkAuthGuard) — get restrictions
GET    /parental-controls/:childId/digest (ClerkAuthGuard) — get activity digest
```

**Mobile — `parental-controls.tsx` (~500 lines):**
```
// Full parental controls dashboard:
// - GlassHeader: "Parental Controls" + lock icon
// - PIN gate: must enter 4-digit PIN to access settings (first time creates PIN)
//   - 4 PIN dots (emerald fill when entered)
//   - Number pad (0-9) with haptic feedback per tap
//   - "Forgot PIN" link → account recovery
//
// After PIN verified:
// - "Linked Accounts" section:
//   - FlatList of child accounts (Avatar + name + last active)
//   - "Link Child Account" button → link-child-account screen
//   - Tap child → expand controls for that child
//
// Per-child controls:
// - "Restricted Mode" toggle (filters mature content)
// - "Max Age Rating" selector: G / PG / PG-13 / R (4 radio buttons)
// - "Daily Time Limit" slider (15min to 8hr, or unlimited)
// - "Direct Messages" selector: None / Contacts Only / Disabled
// - "Can Go Live" toggle
// - "Can Post" toggle
// - "Can Comment" toggle
// - "Weekly Activity Digest" toggle (push notification to parent)
//
// "Activity Report" section:
// - This week's stats: screen time bar chart (7 bars), posts created, messages sent
// - "View Full Report" → detailed breakdown
//
// "Manage" section:
// - "Change PIN" → old PIN + new PIN flow
// - "Unlink Account" → confirm with PIN → destructive button
//
// ScreenErrorBoundary, Skeleton loading, RefreshControl
```

**Mobile — `link-child-account.tsx` (~250 lines):**
```
// Screen to link a child's account:
// - Search input: search by username
// - Results: FlatList of matching users (Avatar + username + displayName)
// - Tap user → confirmation BottomSheet:
//   - Avatar + name + "Link this account?"
//   - Warning: "You will be able to view their activity and set restrictions"
//   - Set 4-digit PIN input
//   - GradientButton "Link Account"
// - ScreenErrorBoundary, EmptyState
```

**Store additions:**
```typescript
isChildAccount: boolean;
setIsChildAccount: (v: boolean) => void;
parentalRestrictions: {
  restrictedMode: boolean;
  maxAgeRating: string;
  dailyLimitMinutes: number | null;
  dmRestriction: string;
  canGoLive: boolean;
  canPost: boolean;
  canComment: boolean;
} | null;
setParentalRestrictions: (r: typeof parentalRestrictions) => void;
```

**i18n keys:**
```json
"parentalControls": {
  "title": "Parental Controls",
  "enterPin": "Enter PIN",
  "createPin": "Create a 4-digit PIN",
  "confirmPin": "Confirm PIN",
  "wrongPin": "Incorrect PIN",
  "forgotPin": "Forgot PIN?",
  "linkedAccounts": "Linked Accounts",
  "linkChild": "Link Child Account",
  "linkConfirm": "Link {{name}}'s account?",
  "linkWarning": "You will be able to view their activity and set restrictions.",
  "unlink": "Unlink Account",
  "unlinkConfirm": "Remove parental controls for {{name}}?",
  "restrictedMode": "Restricted Mode",
  "restrictedModeHint": "Filter content not suitable for young viewers",
  "ageRating": "Content Age Rating",
  "ageG": "G — General Audience",
  "agePG": "PG — Parental Guidance",
  "agePG13": "PG-13 — Parents Strongly Cautioned",
  "ageR": "R — Restricted",
  "dailyLimit": "Daily Time Limit",
  "dailyLimitMinutes": "{{minutes}} minutes",
  "dailyLimitUnlimited": "Unlimited",
  "dmRestriction": "Direct Messages",
  "dmNone": "No Restriction",
  "dmContactsOnly": "Contacts Only",
  "dmDisabled": "Disabled",
  "canGoLive": "Can Go Live",
  "canPost": "Can Create Posts",
  "canComment": "Can Comment",
  "activityDigest": "Weekly Activity Digest",
  "activityDigestHint": "Receive a weekly summary of your child's activity",
  "activityReport": "Activity Report",
  "viewReport": "View Full Report",
  "thisWeek": "This Week",
  "screenTime": "Screen Time",
  "postsCreated": "Posts Created",
  "messagesSent": "Messages Sent",
  "avgDaily": "Average Daily",
  "changePin": "Change PIN",
  "currentPin": "Current PIN",
  "newPin": "New PIN",
  "pinChanged": "PIN changed successfully",
  "searchUser": "Search by username...",
  "noChildren": "No linked accounts",
  "noChildrenSubtitle": "Link a child's account to set up parental controls",
  "parentBadge": "Supervised by {{name}}"
}
```

**~800 lines total**

---

## CONFLICT MATRIX

| File | Agents |
|------|--------|
| `schema.prisma` | 0 only (first) |
| `app.module.ts` | 2, 6, 12 (each registers distinct module) |
| `videos.service.ts` | 5, 6, 8 (distinct methods, no overlap) |
| `videos.controller.ts` | 5, 6, 8 (distinct endpoints) |
| `playlists.service.ts` | 9 only |
| `playlists.controller.ts` | 9 only |
| `channels.service.ts` | 10 only |
| `channels.controller.ts` | 10 only |
| `VideoPlayer.tsx` | 3, 6, 7, 8 (each adds distinct feature: PiP button, clip button, ambient toggle, end screen overlay) |
| `video/[id].tsx` | 3, 4, 5, 7, 8 (each adds distinct section: PiP hook, mini player trigger, premiere UI, ambient bg, end screens) |
| `reel/[id].tsx` | 3, 7 (PiP + ambient — distinct sections) |
| `store/index.ts` | 3, 4, 7, 12 (each adds distinct fields) |
| `settings.tsx` | 2, 12 (each adds one row) |
| `_layout.tsx` | 1, 4, 11 (share intent handler, MiniPlayer, widget sync — distinct hooks) |
| `api.ts` | 2, 5, 6, 8, 9, 10, 12 (each adds to different API groups) |
| `types/index.ts` | 2, 5, 6, 8, 9, 12 (each adds distinct types) |
| `i18n/*.json` | All (each adds own namespace) |

**Resolution:** Agent 0 (schema) first. All others parallel — they touch distinct sections of shared files.

---

## EXECUTION ORDER

1. **Agent 0** (schema changes) — MUST complete first
2. **Agents 1-12** — all in parallel after Agent 0
3. **Final**: `npx prisma db push` + verify TypeScript compilation

---

## ESTIMATED OUTPUT

| Agent | Feature | Lines |
|-------|---------|-------|
| 0 | Schema | ~150 |
| 1 | Share extension | ~500 |
| 2 | Offline download | ~800 |
| 3 | PiP | ~300 |
| 4 | Mini player | ~450 |
| 5 | Video premiere | ~700 |
| 6 | Video clip sharing | ~600 |
| 7 | Ambient mode | ~300 |
| 8 | End screens | ~500 |
| 9 | Collaborative playlists | ~400 |
| 10 | Channel trailer | ~300 |
| 11 | Home screen widgets | ~700 |
| 12 | Parental controls | ~800 |
| **TOTAL** | | **~6,500** |

---

## COMPLETION CRITERIA

After all agents complete:
1. All 12 features functional with full backend + mobile implementation
2. All i18n keys added (en.json + ar.json)
3. All new screens have ScreenErrorBoundary
4. All FlatLists have RefreshControl
5. All loading states use Skeleton components
6. All empty states use EmptyState component
7. Zero TypeScript errors
8. `npx prisma db push` successful
9. Tier 8 = 100% complete → full platform parity achieved
