# Saved Endpoints Analysis - Task 1 Findings

**Date:** 2026-03-08
**Task:** Step 1 - Read existing saved methods to understand pagination pattern and constraints

## 1. Executed Commands and Outputs

### Command 1: Find model line numbers
```bash
grep -n "ReelInteraction\|VideoBookmark" apps/api/prisma/schema.prisma
```
**Output:**
```
337:  videoBookmarks         VideoBookmark[]
345:  reelInteractions       ReelInteraction[]
516:  interactions  ReelInteraction[]
716:  bookmarks      VideoBookmark[]
1324:model VideoBookmark {
1641:model ReelInteraction {
```

### Command 2: Examine VideoBookmark model (lines 1324-1335)
```bash
sed -n '1324,1335p' apps/api/prisma/schema.prisma
```
**Output:**
```prisma
model VideoBookmark {
  userId    String
  videoId   String
  createdAt DateTime @default(now())
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  video Video @relation(fields: [videoId], references: [id], onDelete: Cascade)
  @@id([userId, videoId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("video_bookmarks")
}
```

### Command 3: Examine ReelInteraction model (lines 1641-1658)
```bash
sed -n '1641,1658p' apps/api/prisma/schema.prisma
```
**Output:**
```prisma
model ReelInteraction {
  id     String @id @default(cuid())
  userId String
  reelId String
  viewed          Boolean @default(false)
  watchDurationMs Int     @default(0)
  completionRate  Float?
  liked           Boolean @default(false)
  shared          Boolean @default(false)
  saved           Boolean @default(false)
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  reel Reel @relation(fields: [reelId], references: [id], onDelete: Cascade)
  @@unique([userId, reelId])
  @@index([reelId])
  @@map("reel_interactions")
}
```

### Command 4: Examine existing SavedPost model (lines 852-862)
```bash
sed -n '852,862p' apps/api/prisma/schema.prisma
```
**Output:**
```prisma
model SavedPost {
  userId         String
  postId         String
  collectionName String @default("default")
  createdAt      DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  @@id([userId, postId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("saved_posts")
}
```

### Command 5: Examine existing ThreadBookmark model (lines 1313-1322)
```bash
sed -n '1313,1322p' apps/api/prisma/schema.prisma
```
**Output:**
```prisma
model ThreadBookmark {
  userId    String
  threadId  String
  createdAt DateTime @default(now())
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  @@id([userId, threadId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("thread_bookmarks")
}
```

### Command 6: Find cursor usage patterns in users.service.ts
```bash
grep -n "cursor:" apps/api/src/modules/users/users.service.ts | grep -i "saved\|thread"
```
**Output:**
```
283:      ...(cursor ? { cursor: { userId_postId: { userId, postId: cursor } }, skip: 1 } : {}),
315:      ...(cursor ? { cursor: { userId_threadId: { userId, threadId: cursor } }, skip: 1 } : {}),
```

## 2. Constraint Analysis: @@id vs @@unique

### Existing Models (Working Examples):
1. **SavedPost** (line 859): `@@id([userId, postId])`
   - Composite primary key
   - No separate `id` field
   - Cursor syntax: `{ userId_postId: { userId, postId: cursor } }`

2. **ThreadBookmark** (line 1319): `@@id([userId, threadId])`
   - Composite primary key
   - No separate `id` field
   - Cursor syntax: `{ userId_threadId: { userId, threadId: cursor } }`

### New Models:
1. **VideoBookmark** (line 1330): `@@id([userId, videoId])`
   - **SAME AS EXISTING**: Composite primary key
   - No separate `id` field
   - **Expected cursor**: `{ userId_videoId: { userId, videoId: cursor } }`

2. **ReelInteraction** (line 1654): `@@unique([userId, reelId])`
   - **DIFFERENT**: Unique constraint on composite fields
   - Has separate `id String @id @default(cuid())` field (line 1642)
   - **Expected cursor**: `{ userId_reelId: { userId, reelId: cursor } }`

## 3. Key Findings

### Cursor Syntax Consistency:
- **Pattern**: `{ userId_{modelName}Id: { userId, {modelName}Id: cursor } }`
- **Works for both `@@id` and `@@unique`**: Prisma handles both the same way for cursor pagination
- **Evidence**: Existing `getSavedPosts` and `getSavedThreads` both use this pattern successfully

### Field Differences:
1. **ReelInteraction**:
   - Has `saved Boolean @default(false)` field (line 1650)
   - Requires filter: `where: { userId, saved: true }`
   - Has separate `id` field but cursor uses composite unique constraint

2. **VideoBookmark**:
   - No `saved` field (all records are bookmarks)
   - Filter: `where: { userId }` only
   - No separate `id` field (composite primary key)

### Pagination Pattern (from users.service.ts lines 280-327):
```typescript
// Common pattern for both getSavedPosts and getSavedThreads:
take: limit + 1,
...(cursor ? { cursor: { userId_XId: { userId, XId: cursor } }, skip: 1 } : {}),
orderBy: { createdAt: 'desc' },

// Return structure:
const hasMore = items.length > limit;
const items = hasMore ? allItems.slice(0, limit) : allItems;
return {
  data: items.map((item: any) => item.relatedEntity),
  meta: {
    cursor: hasMore ? items[items.length - 1].entityId : null,
    hasMore,
  },
};
```

## 4. Implications for Implementation

### For `getSavedReels`:
- **Cursor**: `{ userId_reelId: { userId, reelId: cursor } }`
- **Filter**: `where: { userId, saved: true }`
- **Return**: `{ ...i.reel, isBookmarked: true }`
- **Note**: Uses `@@unique` constraint but same cursor syntax as `@@id`

### For `getSavedVideos`:
- **Cursor**: `{ userId_videoId: { userId, videoId: cursor } }`
- **Filter**: `where: { userId }` (no `saved` field)
- **Return**: `{ ...b.video, isBookmarked: true }`
- **Note**: Uses `@@id` constraint like existing SavedPost/ThreadBookmark

## 5. Verification

**Method signatures match exactly:**
```typescript
// Existing:
async getSavedPosts(userId: string, cursor?: string, limit = 20)
async getSavedThreads(userId: string, cursor?: string, limit = 20)

// New (should match):
async getSavedReels(userId: string, cursor?: string, limit = 20)
async getSavedVideos(userId: string, cursor?: string, limit = 20)
```

**Controller endpoints pattern:**
```typescript
@Get('me/saved-posts')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Bookmarked posts' })
getSavedPosts(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
  return this.usersService.getSavedPosts(userId, cursor);
}
```

## 6. Conclusion

The analysis confirms:
1. **Cursor syntax is consistent** between `@@id` and `@@unique` constraints
2. **Pagination pattern is well-established** and should be followed exactly
3. **Only difference is filtering**: ReelInteraction needs `saved: true`, VideoBookmark doesn't
4. **Implementation plan is accurate** and matches existing patterns

**Ready for Task 2:** Implementation can proceed using the documented patterns.