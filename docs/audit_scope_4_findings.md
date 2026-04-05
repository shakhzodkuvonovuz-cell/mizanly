# Scope 4 Audit Report: NestJS Primary API
**Target Area:** `apps/api/` (NestJS Services, Prisma, and Guards)

## 1. Request Throttling (`user-throttler.guard.ts`)
- **Key finding (Sophisticated Bucket Distribution):** The throttle guard protects endpoints heavily against spambots by isolating `Clerk` authentications based on unique ID strings, and only defaulting to IPs (`req.ip` over spoofable `X-Forwarded-For` records) for unauthorized attempts. If IP fails, it defaults to calculating an MD5 hash over the raw Header configurations to isolate malicious traffic requests.
- **DDoS/Spam Mitigations:** An incredibly unique implementation named `@TargetThrottle` modifies standard Throttle modules to block users from specifically targeting IDs. Rather than limiting how many requests a user can make universally, it tracks and limits how many requests a user is directing at a specific `target_Id` mitigating mass un-follow scripts or harassment.

## 2. Prisma Architectonics and Controller Logic (`posts.service.ts`)
- **N+1 Mitigation Check:** Queries are not susceptible to Prisma's default N+1 mapping. All nested relationships (e.g. `user`) are requested through defined `POST_SELECT` payloads rather than utilizing broad `.findMany({ include: { user: true } })` declarations which would cause aggressive memory overhead fetching full user entities with passwords/tokens instead of selective models.
- **Feed Cache Resolution:** `getFeed()` incorporates an aggressive Redis sorted set for rendering For-You algorithms caching top 500 options every 120s rather than forcing Prisma to compute trending timelines on every feed load. `enrichPostsForUser` utilizes single batched checks against secondary identifiers preventing mapped `.findUnique` bottlenecks across arrays. 
- **Decoupled Load:** Almost all processing during post ingestion (Resizes, AI translations, Moderations, Metrics) is completely excised off the main Javascript Event Loop onto `QueueService`, avoiding Node.JS locking up processing inbound traffic during heavy load. 
- **Hashtag Incremental Growth:** A single optimized RAW query `UPDATE hashtags SET "postsCount" = "postsCount" + 1 WHERE name = ANY(...)` allows Prisma to bypass transaction locks that standard `.update()` functions naturally demand.

## Summary Status
Scope 4 demonstrates a masterclass in NodeJS structuring. All database mappings are secured against N+1 bottlenecks. Traffic filtering operates efficiently at scale and offloads processing from the JS single-thread properly.
