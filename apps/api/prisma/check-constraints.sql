-- Run once after `prisma db push` to add CHECK constraints
-- Prisma doesn't support CHECK natively, so these are applied via raw SQL.
--
-- Usage: psql $DATABASE_URL -f prisma/check-constraints.sql
-- Or via Railway: railway run psql -f prisma/check-constraints.sql

-- Prevent negative coin/diamond balances at the database level
ALTER TABLE coin_balances ADD CONSTRAINT IF NOT EXISTS coins_non_negative CHECK (coins >= 0);
ALTER TABLE coin_balances ADD CONSTRAINT IF NOT EXISTS diamonds_non_negative CHECK (diamonds >= 0);

-- Prevent negative engagement counters
ALTER TABLE posts ADD CONSTRAINT IF NOT EXISTS posts_likes_non_negative CHECK ("likesCount" >= 0);
ALTER TABLE posts ADD CONSTRAINT IF NOT EXISTS posts_comments_non_negative CHECK ("commentsCount" >= 0);
ALTER TABLE reels ADD CONSTRAINT IF NOT EXISTS reels_likes_non_negative CHECK ("likesCount" >= 0);
ALTER TABLE reels ADD CONSTRAINT IF NOT EXISTS reels_views_non_negative CHECK ("viewsCount" >= 0);
ALTER TABLE threads ADD CONSTRAINT IF NOT EXISTS threads_likes_non_negative CHECK ("likesCount" >= 0);
ALTER TABLE videos ADD CONSTRAINT IF NOT EXISTS videos_likes_non_negative CHECK ("likesCount" >= 0);
ALTER TABLE videos ADD CONSTRAINT IF NOT EXISTS videos_views_non_negative CHECK ("viewsCount" >= 0);

-- Prevent negative follower/following counts
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_followers_non_negative CHECK ("followersCount" >= 0);
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_following_non_negative CHECK ("followingCount" >= 0);
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_posts_non_negative CHECK ("postsCount" >= 0);
