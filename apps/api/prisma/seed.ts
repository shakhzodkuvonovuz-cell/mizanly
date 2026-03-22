import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const users = [
  {
    id: 'user_seed_1',
    clerkId: 'clerk_seed_1',
    username: 'shakhzod',
    displayName: 'Shakhzod',
    email: 'shakh@mizanly.app',
    bio: 'Founder of Mizanly. Building the future of Muslim social media.',
    isVerified: true,
    role: 'ADMIN' as const,
    language: 'en',
  },
  {
    id: 'user_seed_2',
    clerkId: 'clerk_seed_2',
    username: 'aisha',
    displayName: 'Aisha Ahmed',
    email: 'aisha@test.com',
    bio: 'Islamic calligraphy artist. Sharing the beauty of Arabic script.',
    isVerified: false,
    role: 'CREATOR' as const,
    language: 'en',
  },
  {
    id: 'user_seed_3',
    clerkId: 'clerk_seed_3',
    username: 'omar',
    displayName: 'Omar Hassan',
    email: 'omar@test.com',
    bio: 'Tech & deen. Software engineer by day, Quran student by night.',
    isVerified: false,
    role: 'USER' as const,
    language: 'en',
  },
];

const hashtags = [
  { id: 'hashtag_seed_1', name: 'islamicart' },
  { id: 'hashtag_seed_2', name: 'quran' },
  { id: 'hashtag_seed_3', name: 'ramadan' },
  { id: 'hashtag_seed_4', name: 'dua' },
  { id: 'hashtag_seed_5', name: 'mizanly' },
];

const posts = [
  {
    id: 'post_seed_1',
    userId: 'user_seed_1',
    content:
      'Alhamdulillah, Mizanly is live! A social platform built for our ummah, by our ummah. No algorithms pushing haram content. Just meaningful connections. #mizanly',
    postType: 'TEXT' as const,
    hashtags: ['mizanly'],
    space: 'SAF' as const,
    likesCount: 42,
    commentsCount: 7,
    sharesCount: 12,
  },
  {
    id: 'post_seed_2',
    userId: 'user_seed_2',
    content:
      'Just finished this bismillah piece in Thuluth script. Took 3 weeks to get the letter proportions right. The beauty of Arabic calligraphy is in the discipline. #islamicart #quran',
    postType: 'IMAGE' as const,
    hashtags: ['islamicart', 'quran'],
    space: 'SAF' as const,
    mediaUrls: ['https://placehold.co/1080x1080/0A7B4F/FFF?text=Bismillah+Calligraphy'],
    mediaTypes: ['image/jpeg'],
    likesCount: 128,
    commentsCount: 23,
    sharesCount: 45,
    savesCount: 67,
  },
  {
    id: 'post_seed_3',
    userId: 'user_seed_3',
    content:
      'Reminder: The Prophet (peace be upon him) said, "The best of you are those who learn the Quran and teach it." - Sahih al-Bukhari. Start your Quran journey today. #quran #dua',
    postType: 'TEXT' as const,
    hashtags: ['quran', 'dua'],
    space: 'SAF' as const,
    likesCount: 89,
    commentsCount: 14,
    sharesCount: 31,
    savesCount: 55,
  },
  {
    id: 'post_seed_4',
    userId: 'user_seed_1',
    content:
      'Ramadan prep checklist:\n1. Set your Quran reading plan\n2. Identify local iftar gatherings\n3. Plan your charity goals\n4. Stock up on dates and water\n5. Adjust your sleep schedule\n\nWhat would you add? #ramadan',
    postType: 'TEXT' as const,
    hashtags: ['ramadan'],
    space: 'SAF' as const,
    likesCount: 215,
    commentsCount: 48,
    sharesCount: 93,
    savesCount: 178,
  },
  {
    id: 'post_seed_5',
    userId: 'user_seed_2',
    content:
      'Morning dua: "O Allah, I ask You for beneficial knowledge, good provision, and accepted deeds." Start every morning with intention. #dua #islamicart',
    postType: 'IMAGE' as const,
    hashtags: ['dua', 'islamicart'],
    space: 'SAF' as const,
    mediaUrls: ['https://placehold.co/1080x1350/C8963E/FFF?text=Morning+Dua'],
    mediaTypes: ['image/jpeg'],
    likesCount: 176,
    commentsCount: 19,
    sharesCount: 62,
    savesCount: 144,
  },
];

const threads = [
  {
    id: 'thread_seed_1',
    userId: 'user_seed_3',
    content:
      'Hot take: Muslim tech founders need to stop copying Western social media and start building products that reflect our values from the ground up. Thread:',
    hashtags: ['mizanly'],
    likesCount: 67,
    repliesCount: 12,
    repostsCount: 8,
    viewsCount: 1420,
  },
  {
    id: 'thread_seed_2',
    userId: 'user_seed_1',
    content:
      'Why we built Mizanly with privacy-first architecture: Your data belongs to you, not advertisers. No tracking pixels, no selling your browsing habits. Here is how we do it differently.',
    hashtags: ['mizanly'],
    likesCount: 134,
    repliesCount: 28,
    repostsCount: 19,
    viewsCount: 3200,
  },
  {
    id: 'thread_seed_3',
    userId: 'user_seed_2',
    content:
      'The Islamic Golden Age produced incredible advances in art, science, and mathematics. We need to reclaim that spirit of innovation. What are you building for the ummah?',
    hashtags: ['islamicart'],
    likesCount: 91,
    repliesCount: 15,
    repostsCount: 11,
    viewsCount: 2100,
  },
];

// Follow relationships: everyone follows everyone (bidirectional)
const follows = [
  { followerId: 'user_seed_1', followingId: 'user_seed_2' },
  { followerId: 'user_seed_1', followingId: 'user_seed_3' },
  { followerId: 'user_seed_2', followingId: 'user_seed_1' },
  { followerId: 'user_seed_2', followingId: 'user_seed_3' },
  { followerId: 'user_seed_3', followingId: 'user_seed_1' },
  { followerId: 'user_seed_3', followingId: 'user_seed_2' },
];

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding database...');

  // 1. Users
  console.log('  Creating users...');
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: {
        id: u.id,
        clerkId: u.clerkId,
        username: u.username,
        displayName: u.displayName,
        email: u.email,
        bio: u.bio,
        isVerified: u.isVerified,
        role: u.role,
        language: u.language,
        followersCount: 2, // each user is followed by the other 2
        followingCount: 2,
        postsCount: u.id === 'user_seed_1' ? 2 : u.id === 'user_seed_2' ? 2 : 1,
        threadsCount: u.id === 'user_seed_1' ? 1 : u.id === 'user_seed_2' ? 1 : 1,
      },
    });
  }

  // 2. UserSettings (one per user)
  console.log('  Creating user settings...');
  for (const u of users) {
    await prisma.userSettings.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id,
      },
    });
  }

  // 3. Hashtags
  console.log('  Creating hashtags...');
  for (const h of hashtags) {
    // Count posts and threads using each hashtag
    const postCount = posts.filter((p) => p.hashtags.includes(h.name)).length;
    const threadCount = threads.filter((t) => t.hashtags.includes(h.name)).length;

    await prisma.hashtag.upsert({
      where: { id: h.id },
      update: {},
      create: {
        id: h.id,
        name: h.name,
        postsCount: postCount,
        threadsCount: threadCount,
      },
    });
  }

  // 4. Posts
  console.log('  Creating posts...');
  const now = new Date();
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    // Stagger creation times so they appear in chronological order
    const createdAt = new Date(now.getTime() - (posts.length - i) * 3600 * 1000);

    await prisma.post.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        userId: p.userId,
        content: p.content,
        postType: p.postType,
        hashtags: p.hashtags,
        space: p.space,
        mediaUrls: p.mediaUrls ?? [],
        mediaTypes: p.mediaTypes ?? [],
        likesCount: p.likesCount,
        commentsCount: p.commentsCount,
        sharesCount: p.sharesCount,
        savesCount: p.savesCount ?? 0,
        createdAt,
      },
    });
  }

  // 5. Threads
  console.log('  Creating threads...');
  for (let i = 0; i < threads.length; i++) {
    const t = threads[i];
    const createdAt = new Date(now.getTime() - (threads.length - i) * 7200 * 1000);

    await prisma.thread.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        userId: t.userId,
        content: t.content,
        hashtags: t.hashtags,
        isChainHead: true,
        likesCount: t.likesCount,
        repliesCount: t.repliesCount,
        repostsCount: t.repostsCount,
        viewsCount: t.viewsCount,
        createdAt,
      },
    });
  }

  // 6. Follow relationships
  console.log('  Creating follow relationships...');
  for (const f of follows) {
    // Use raw upsert since Follow uses composite PK
    await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: f.followerId,
          followingId: f.followingId,
        },
      },
      update: {},
      create: {
        followerId: f.followerId,
        followingId: f.followingId,
      },
    });
  }

  console.log('Seed complete.');
  console.log(`  Users: ${users.length}`);
  console.log(`  Posts: ${posts.length}`);
  console.log(`  Threads: ${threads.length}`);
  console.log(`  Hashtags: ${hashtags.length}`);
  console.log(`  Follows: ${follows.length}`);
  console.log(`  UserSettings: ${users.length}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
