# See What I've Built - App Review Design

**Date:** 2026-03-08
**Author:** Claude Code
**Status:** Approved

## Overview
Run the complete Mizanly application to "see what I've built" - start backend and mobile servers, provide localhost links for web view, generate QR code for mobile testing, and capture screenshots of all 5 spaces.

## Purpose
- Verify the ~97% complete Mizanly project works end-to-end
- Run backend API (NestJS) and mobile app (Expo RN) locally
- Provide access via phone (Expo Go) and web browser
- Capture screenshots of all 5 spaces for documentation/review
- **Strict constraint:** No code edits - only server startup and dependency installation

## Architecture Review
The Mizanly project consists of:
1. **Backend API** (`apps/api`): NestJS 10, Prisma, Neon PostgreSQL, Redis
   - Runs on `localhost:3000`
   - Swagger docs at `/docs`
   - 27 modules, 28 controllers, ~224 endpoints

2. **Mobile App** (`apps/mobile`): React Native Expo SDK 52
   - Dev server on `localhost:8081`
   - Web preview on `localhost:19006`
   - 46 screens across 5 spaces (Saf, Majlis, Risalah, Bakra, Minbar)

## Steps (Sequential Execution)

### 1. Dependency Check & Installation
**Location:** `C:\Users\shakh\OneDrive\Desktop\mizanly`
**Commands:**
```bash
cd apps/api && npm install
cd apps/mobile && npm install
```
**Note:** npm NOT in shell PATH - must run in Windows terminal
**Safety:** Installation only, no source code modifications

### 2. Backend Server Startup
**Command:** `cd apps/api && npm run start:dev`
**Expected:** Server starts on `localhost:3000`
**Verification:**
- API responding at `http://localhost:3000/api/v1/health`
- Swagger docs at `http://localhost:3000/docs`
- Database connection successful

### 3. Mobile Dev Server Startup
**Command:** `cd apps/mobile && npx expo start`
**Expected:** Expo dev server starts
**Outputs:**
- QR code for Expo Go app scanning
- Local URL: `http://localhost:8081`
- Web preview: `http://localhost:19006`
- Metro bundler logs

### 4. Access & Testing
**Mobile (Phone):**
1. Install Expo Go app
2. Scan QR code with camera
3. App loads on device
4. Test all 5 spaces manually

**Web (Browser):**
1. Open `http://localhost:19006`
2. Web version of app
3. Limited functionality (some native features unavailable)

**API Documentation:**
1. Open `http://localhost:3000/docs`
2. Browse all 224+ endpoints
3. Test authenticated endpoints with JWT

### 5. Screenshot Capture Process
**Manual approach (no automation tools):**
1. Navigate through each of the 5 spaces on phone
2. Capture screenshots using device screenshot function
3. Suggested navigation path:
   - Saf (Instagram-style feed + stories)
   - Majlis (Twitter-style threads)
   - Risalah (WhatsApp-style messaging)
   - Bakra (TikTok-style short videos)
   - Minbar (YouTube-style long videos)
   - Settings, profile, discovery screens

## Expected Outputs

### Localhost Links
1. **API:** `http://localhost:3000`
2. **API Docs:** `http://localhost:3000/docs`
3. **Expo Dev:** `http://localhost:8081`
4. **Web Preview:** `http://localhost:19006`

### QR Code
- Displayed in terminal when Expo starts
- Scannable with Expo Go app

### Screenshots
- 5 main space screens
- Key feature screens (post creation, messaging, video playback)
- Total: ~10-15 representative screenshots

## Error Handling & Contingencies

### Potential Issues
1. **Port conflicts:** 3000 or 8081 already in use
   - Solution: Identify conflicting process, kill if safe
2. **Missing dependencies:** npm install fails
   - Solution: Check network, retry with `--legacy-peer-deps`
3. **Database connection:** Neon PostgreSQL unreachable
   - Solution: Check `.env` file, verify connection string
4. **Expo build errors:** Metro bundler issues
   - Solution: Clear cache `npx expo start --clear`

### Fallback Options
If servers fail to start:
1. Provide static analysis of codebase
2. Generate architecture diagram from existing docs
3. List all 46 screens with descriptions

## Safety & Constraints

### Absolute Rules
1. **NO code edits** - read-only access to source
2. **NO file modifications** - except npm install (adds node_modules)
3. **NO database modifications** - read-only connection testing only
4. **Use Windows terminal** for all commands (npm not in shell PATH)

### Permission Boundaries
- ✅ Allowed: Starting servers, installing dependencies
- ✅ Allowed: Reading logs, checking ports
- ✅ Allowed: Providing URLs and QR codes
- ❌ Not allowed: Modifying source code
- ❌ Not allowed: Changing configuration files
- ❌ Not allowed: Writing test data to database

## Verification Criteria

### Success Criteria
1. Backend server running on `localhost:3000` with `/health` endpoint responding
2. Expo dev server running with QR code displayed
3. Mobile app loads on phone via Expo Go
4. Web preview loads in browser at `localhost:19006`
5. User can navigate through app and capture screenshots

### Completion Signals
- ✅ Both servers started successfully
- ✅ Links provided to user
- ✅ QR code displayed
- ✅ Screenshot guidance provided
- ✅ Any errors diagnosed and reported

## Notes
- Project state: ~97% feature complete (Batch 18 finished)
- 5 spaces: Saf, Majlis, Risalah, Bakra, Minbar
- Brand colors: Emerald #0A7B4F + Gold #C8963E
- Dark mode primary, RTL Arabic support
- All CLAUDE.md quality rules enforced in codebase