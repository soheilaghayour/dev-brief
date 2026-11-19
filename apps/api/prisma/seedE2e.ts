import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { loadEnv } from '../src/env.js';
import { seedSources } from './seed.js';

const HOUR = 3_600_000;
const STORY_COUNT = 45;

/** Fixed ids make a rerun update the same rows. */
const e2eStoryId = (number: number) => `ce2e${String(number).padStart(8, '0')}`;
const OLD_STORY_ID = e2eStoryId(STORY_COUNT + 1);

const TAG_CYCLE = [
  ['react'],
  ['typescript'],
  ['react', 'typescript'],
  ['databases'],
  ['ai-llms', 'performance'],
  ['rust'],
];

// Source slugs from prisma/seed/sources.json: every third story is on Hacker News, Dev.to or a blog.
const SOURCE_CYCLE = [
  ['hn'],
  ['devto'],
  ['rss-react-blog'],
  ['hn', 'rss-typescript-blog'],
  ['devto', 'hn'],
  ['rss-vercel-blog'],
];

type StorySeed = {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  sourceSlugs: string[];
  publishedAt: Date;
  rankScore: number;
};

/** The deterministic stories: 45 inside the Top window and one 20 days old, which only Latest shows. */
export function buildStorySeeds(now: Date): StorySeed[] {
  const recent = Array.from({ length: STORY_COUNT }, (_, index): StorySeed => {
    const number = index + 1;
    const label = String(number).padStart(2, '0');
    return {
      id: e2eStoryId(number),
      title: number === 3 ? 'Bun runtime reaches production readiness' : `E2E story ${label}`,
      excerpt:
        number === 3
          ? 'A look at the Bun runtime and how it compares with Node.js.'
          : `Fixture story number ${number}.`,
      tags: TAG_CYCLE[index % TAG_CYCLE.length] ?? [],
      sourceSlugs: SOURCE_CYCLE[index % SOURCE_CYCLE.length] ?? [],
      publishedAt: new Date(now.getTime() - number * 0.5 * HOUR),
      // 7 is coprime with 45, so ranks are unique and Top order differs from Latest order.
      rankScore: (number * 7) % STORY_COUNT,
    };
  });
  const old: StorySeed = {
    id: OLD_STORY_ID,
    title: 'E2E story from the archive',
    excerpt: 'Older than the Top window; only Latest lists it.',
    tags: ['career'],
    sourceSlugs: ['rss-react-blog'],
    publishedAt: new Date(now.getTime() - 20 * 24 * HOUR),
    rankScore: 1000,
  };
  return [...recent, old];
}

async function seedStory(prisma: PrismaClient, seed: StorySeed) {
  const slug = seed.id;
  const url = `https://e2e.example.com/${slug}`;
  const fields = {
    url,
    domain: 'e2e.example.com',
    title: seed.title,
    normalizedTitle: seed.title.toLowerCase(),
    excerpt: seed.excerpt,
    author: 'e2e-author',
    publishedAt: seed.publishedAt,
    readingTimeMinutes: 4,
    tags: seed.tags,
    taggerVersion: 1,
    rankScore: seed.rankScore,
  };
  const story = await prisma.story.upsert({
    where: { canonicalUrl: url },
    create: { id: seed.id, canonicalUrl: url, ...fields },
    update: fields,
  });
  for (const sourceSlug of seed.sourceSlugs) {
    const source = await prisma.source.findUniqueOrThrow({ where: { slug: sourceSlug } });
    const isDiscussion = source.kind === 'hn' || source.kind === 'devto';
    const itemFields = {
      storyId: story.id,
      url,
      canonicalUrl: url,
      discussionUrl: isDiscussion ? `https://${source.slug}.example.com/${slug}` : null,
      title: seed.title,
      author: 'e2e-author',
      publishedAt: seed.publishedAt,
      points: source.kind === 'hn' ? 100 + seed.rankScore : null,
      commentsCount: isDiscussion ? 10 : null,
      reactionsCount: source.kind === 'devto' ? 50 + seed.rankScore : null,
    };
    await prisma.sourceItem.upsert({
      where: { sourceId_externalId: { sourceId: source.id, externalId: slug } },
      create: { sourceId: source.id, externalId: slug, ...itemFields },
      update: itemFields,
    });
  }
}

/** Throws unless the database is marked as a throwaway one (name ends in `_test` or `e2e`) or the run opts in. */
export function assertDestructiveSeedAllowed(databaseUrl: string, allowDestructive: boolean) {
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (allowDestructive || /(_test|e2e)$/.test(databaseName)) return;
  throw new Error(
    `db:seed:e2e deletes every story and save, and "${databaseName}" is not an e2e database (its name must end in "_test" or "e2e"). Set ALLOW_DESTRUCTIVE_SEED=1 to run it anyway.`,
  );
}

/** Replaces all stories and saves with the fixture ones and resets every source to freshly fetched and closed. */
export async function seedE2e(prisma: PrismaClient, now = new Date()) {
  await seedSources(prisma);
  // Leftovers (e.g. from integration tests sharing the CI database) would break the exact counts specs rely on.
  // Saves go first: they restrict deleting their story.
  await prisma.$transaction([prisma.save.deleteMany(), prisma.story.deleteMany()]);
  for (const seed of buildStorySeeds(now)) await seedStory(prisma, seed);
  await prisma.source.updateMany({
    data: { lastSuccessAt: now, consecutiveFailures: 0, circuitOpenUntil: null },
  });
}

async function main() {
  const env = loadEnv();
  assertDestructiveSeedAllowed(env.DATABASE_URL, env.ALLOW_DESTRUCTIVE_SEED);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    await seedE2e(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Only a direct run (`pnpm db:seed:e2e`) seeds the database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
