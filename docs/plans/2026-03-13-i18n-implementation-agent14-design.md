# i18n Implementation — Agent 14 Design

**Date**: 2026-03-13
**Agent**: 14 of Batch 35
**Workstream**: i18n Rollout (Workstream C)
**Scope**: 12 screens — Islamic + Monetization + Utility
**Status**: Approved ✅

---

## 1. Overview

### Goal
Add i18n `t()` calls to 12 specified screens following batch architecture pattern with zero file conflicts.

### Scope (12 Files)
1. ✅ `prayer-times.tsx` — Completed
2. ✅ `hadith.tsx` — Completed
3. ✅ `mosque-finder.tsx` — Completed
4. ✅ `send-tip.tsx` — Completed
5. ✅ `membership-tiers.tsx` — Completed
6. 🔄 `2fa-setup.tsx` — In Progress
7. `audio-room.tsx`
8. `create-event.tsx`
9. `event-detail.tsx`
10. `search.tsx`
11. `notifications.tsx`
12. `discover.tsx`

### Core Principles
- **Zero file conflicts** — No two agents touch the same file
- **Only string replacements** — No changes to component structure, styling, or logic
- **Complete coverage** — Replace ALL user-visible hardcoded English strings
- **Follow existing patterns** — Use keys from `en.json` where they exist
- **Descriptive placeholders** — For missing keys, use logical keys (e.g., `t('auth.twoFactorAuthentication')`)

---

## 2. Implementation Pattern

### Architecture Pattern (per ARCHITECT_INSTRUCTIONS.md)
```tsx
// 1. Add import (after React imports)
import { useTranslation } from '@/hooks/useTranslation';

// 2. Add hook call inside component function
const { t } = useTranslation();

// 3. Replace strings systematically
<Text>{t('common.search')}</Text>
```

### String Replacement Types
- **Text components**: `<Text>Label</Text>` → `<Text>{t('common.label')}</Text>`
- **Placeholders**: `placeholder="Search..."` → `placeholder={t('common.search')}`
- **Button labels**: `title="Submit"` → `title={t('common.submit')}`
- **Alert/error messages**: `Alert.alert('Error', 'Failed')` → `Alert.alert(t('common.error'), t('common.failed'))`

---

## 3. Edge Case Handling

### String Interpolation
```tsx
// Before: `${count} followers`
// After: `t('profile.followersCount', { count })`
```

### Dynamic Keys
```tsx
// Before: `Facility: ${facility}`
// After: `t(`islamic.facilities.${facility}`)`
// Example from mosque-finder.tsx
```

### Pluralization
```tsx
// Use i18next count parameter
t('islamic.mosquesNearby', { count: filteredMosques.length })
```

### Nested Components
If a file contains subcomponents (e.g., `TierCard` in membership-tiers.tsx):
- Add `useTranslation()` hook inside each component that needs translations
- Import `useTranslation` in each component file

### What NOT to Replace
- `console.log` messages (dev-facing)
- API error messages (dev-facing)
- Technical strings, file paths, URLs
- **DO replace**: User-facing error messages, success messages, labels, instructions

---

## 4. Key Management Strategy

### For Existing Keys
Use keys from `apps/mobile/src/i18n/en.json` where they exist:
- `t('common.save')` for "Save"
- `t('common.cancel')` for "Cancel"
- `t('auth.twoFactorEnabled')` for "Two-factor authentication enabled"

### For Missing Keys
Use descriptive placeholder keys (per instructions):
- `t('auth.twoFactorAuthentication')` for "Two-Factor Authentication"
- `t('auth.secureYourAccount')` for "Secure Your Account"
- `t('auth.step1InstallAuthenticatorApp')` for "Step 1: Install Authenticator App"

**Rationale**: Follows explicit instructions in `ARCHITECT_INSTRUCTIONS.md`: "For strings not in en.json yet, use descriptive keys... — we'll add them in a follow-up."

---

## 5. Verification Checklist

### File Requirements (Each of 12 files)
- [ ] `useTranslation` imported
- [ ] `const { t } = useTranslation()` called inside component
- [ ] ALL user-visible strings replaced with `t()` calls
- [ ] No remaining hardcoded user-facing English strings
- [ ] String interpolation preserved correctly
- [ ] 0 `as any` introduced

### Post-Implementation Verification
- [ ] `git status` shows only 12 modified files
- [ ] No `as any` in modified code
- [ ] Commit with message: `feat: batch 35 agent 14 — i18n rollout for Islamic + Monetization + Utility screens`

### Integration Verification (Post-Batch)
- [ ] App does not crash due to missing translation keys
- [ ] Placeholder keys appear (e.g., `auth.twoFactorAuthentication`) until follow-up batch
- [ ] RTL layout works with existing Arabic translations

---

## 6. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Missing translation keys cause app errors | Use i18next fallback to key name (default behavior) |
| String interpolation syntax errors | Preserve exact pattern: `t('key', { param: value })` |
| Non-visible strings accidentally replaced | Only replace strings in JSX, Alert, user-facing components |
| Incomplete string replacement | Systematic file-by-file review |
| File conflicts with other agents | Follow Agent 14 file list exactly, no other files |

---

## 7. Success Metrics

- [ ] **All 12 files** modified with i18n support
- [ ] **Zero `as any`** introduced in code
- [ ] **ALL user-visible strings** replaced with `t()` calls
- [ ] **Commit created** with proper message: `feat: batch 35 agent 14 — i18n rollout for Islamic + Monetization + Utility screens`
- [ ] **No regressions** in existing functionality
- [ ] **Zero file conflicts** with other Batch 35 agents

---

## 8. Follow-up Work (Post-Batch 35)

1. **Add missing translation keys** to `en.json` and `ar.json`
2. **Test RTL layout** with Arabic translations
3. **Consider adding** language selector UI
4. **Verify translation coverage** across all 119 screens

---

**Approval Timeline**:
- Section 1: Overview & Principles — ✅ Approved
- Section 2: Implementation Details — ✅ Approved
- Section 3: Verification & Next Steps — ✅ Approved

**Next Action**: Invoke `writing-plans` skill to create implementation plan.