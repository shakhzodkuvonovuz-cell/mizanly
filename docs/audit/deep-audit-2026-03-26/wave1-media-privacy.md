# Wave 1: Media Upload Privacy / EXIF Audit

## Summary
9 findings. 2 CRITICAL, 4 HIGH, 1 MEDIUM, 1 LOW. Every uploaded photo leaks GPS coordinates.

## CRITICAL

### F1: addMediaJob() does NOT exist — MediaProcessor is dead code
- **File:** queue.service.ts has NO addMediaJob method. media.processor.ts has working EXIF stripping code that can never execute.
- **Failure:** EXIF stripping, image resize, BlurHash generation never run.

### F2: Direct-to-R2 presigned upload bypasses server — no processing possible
- **Evidence:** Mobile uploads blob directly to R2 via presigned PUT URL. Server never touches file bytes.
- **Architecture gap:** Even if addMediaJob existed, there's no hook point (no upload completion callback).

## HIGH

### F3: 27 of 28 image picker calls missing `exif: false` — and exif:false doesn't strip file bytes anyway
- Only `create-post.tsx:186` sets exif:false. All 27 others don't.
- expo-image-picker's exif:false only controls JS return value, NOT file on disk.

### F5: Profile photos (avatars/covers) uploaded with full EXIF
- Most publicly visible images. GPS coordinates in every profile photo.

### F6: Chat/DM images uploaded with full EXIF
- Users sharing photos in conversations unknowingly share GPS location with recipients.

### F9: Original files with EXIF persist indefinitely in R2 (no lifecycle rules)
- CacheControl: 'immutable', 1 year cache. No cleanup. Historical uploads are growing liability.

## MEDIUM
### F7: Video metadata not explicitly stripped; R2 original accessible pre-transcoding

## LOW
### F8: BlurHash computation produces average hex color, not real BlurHash encoding

## Root Cause
Architecture chose presigned direct-to-R2 for performance but never built post-upload processing. Fix: Cloudflare Worker on R2 bucket to strip EXIF on upload.
