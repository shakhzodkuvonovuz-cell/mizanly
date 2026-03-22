# Profile Polish Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete Step 4 Profile Polish with QR screen, improved URL parsing, and settings UI cleanup

**Architecture:** Add QR screen with save/share functionality, enhance RichText regex to catch protocol‑less URLs, fix duplicate UI elements in settings

**Tech Stack:** React Native Expo, react‑native‑qrcode‑svg, react‑native‑view‑shot, expo‑media‑library, TypeScript

---

## Task 1: Install Dependencies
\`\`\`bash
cd apps/mobile && npx expo install react-native-qrcode-svg react-native-view-shot expo-media-library
cd /c/Users/shakh/OneDrive/Desktop/mizanly
git add apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "chore: install QR code dependencies"
\`\`\`

## Task 2: Create QR Screen
Create \`apps/mobile/app/(screens)/qr-profile.tsx\` with QR code, save/share buttons, profile info.

## Task 3: Update Profile Screen
Add \`showShareSheet\` state and BottomSheet with "Share Profile" and "Show QR Code" options in \`apps/mobile/app/(screens)/profile/[username].tsx\`.

## Task 4: Enhance RichText URL Parsing
Update regex in \`apps/mobile/src/components/ui/RichText.tsx\` to match protocol‑less URLs like \`example.com\`.

## Task 5: Clean Settings UI
Remove duplicate divider (line 207‑208) and stray "Content" header (line 154) in \`apps/mobile/app/(screens)/settings.tsx\`.

## Task 6: Final Verification
\`\`\`bash
cd apps/mobile && npx tsc --noEmit
git add -A
git commit -m "feat: complete Step 4 Profile Polish enhancements"
\`\`\`

---

**Plan complete and saved to \`docs/plans/2026-03-06-profile-polish-implementation.md\`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
