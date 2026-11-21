import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { A2uiServerMessageSchema, EXAMPLE_QUESTIONS } from '@devbrief/shared';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { loadEnv } from '../src/env.js';
import { seedSources } from '../src/cli/seedSources.js';
import { questionHash } from '../src/modules/copilot/normalizeQuestion.js';

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

/** Fixed stories that carry a stored summary, so specs can check how one renders without a model call. */
export const SUMMARISED_STORY_ID = e2eStoryId(4);
export const SUMMARISED_NO_CONSENSUS_STORY_ID = e2eStoryId(5);

const SUMMARY_TLDR = [
  'First point of the fixture summary.',
  'Second point of the fixture summary.',
  'Third point of the fixture summary.',
];

/** The fixed 3-member cluster (HN representative, Dev.to, one blog); the clusters specs open it by these ids. */
export const CLUSTER_ID = 'cc2e00000001';
export const CLUSTER_REPRESENTATIVE_ID = e2eStoryId(47);
const CLUSTER_DEVTO_ID = e2eStoryId(48);
const CLUSTER_BLOG_ID = e2eStoryId(49);
export const CLUSTER_MEMBER_IDS = [CLUSTER_DEVTO_ID, CLUSTER_BLOG_ID];

type StorySeed = {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  sourceSlugs: string[];
  publishedAt: Date;
  rankScore: number;
  clusterId?: string;
};

/** The cluster's stories: below every other story in Top and newer than the 20-day archive story in Latest, so no other spec's order or counts shift by more than the one card. */
export function buildClusterSeeds(now: Date): StorySeed[] {
  const publishedAt = new Date(now.getTime() - 3 * 24 * HOUR);
  const common = {
    excerpt: 'Part of the fixture cluster.',
    tags: [],
    publishedAt,
    clusterId: CLUSTER_ID,
  };
  return [
    {
      ...common,
      id: CLUSTER_REPRESENTATIVE_ID,
      title: 'Zephyr runtime lands in stable',
      sourceSlugs: ['hn'],
      rankScore: -1,
    },
    {
      ...common,
      id: CLUSTER_DEVTO_ID,
      title: 'Hands-on with the Zephyr runtime',
      sourceSlugs: ['devto'],
      rankScore: -2,
    },
    {
      ...common,
      id: CLUSTER_BLOG_ID,
      title: 'Why we moved to Zephyr',
      sourceSlugs: ['rss-react-blog'],
      rankScore: -3,
    },
  ];
}

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
    clusterId: seed.clusterId ?? null,
    isPrimary: !CLUSTER_MEMBER_IDS.includes(seed.id),
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

/** Tags with radar history, and the one day (counting back from yesterday) on which no tag has a row. */
const RADAR_TAGS = ['react', 'typescript', 'rust', 'ai-llms', 'databases', 'go'];
const RADAR_DAYS = 60;
const RADAR_GAP_DAYS_AGO = 3;

/** 60 days of `TagDailyStat` ending yesterday (UTC) for six tags, with a gap day the radar must show as 0. */
export function buildTagDailyStats(now: Date) {
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: RADAR_DAYS }, (_, index) => index + 1)
    .filter((daysAgo) => daysAgo !== RADAR_GAP_DAYS_AGO)
    .flatMap((daysAgo) =>
      RADAR_TAGS.map((tag, tagIndex) => {
        // Recent days weigh more for the lower-numbered tags, so the movers have distinct deltas; `go`, the last tag, stays flat (25 → 25, 0%) over 7d.
        const storyCount =
          1 + ((daysAgo * 7 + tagIndex * 5) % 6) + (daysAgo <= 7 ? 6 - tagIndex : 0);
        return {
          day: new Date(todayMs - daysAgo * 86_400_000),
          tag,
          storyCount,
          engagementSum: storyCount * 40,
          avgPercentile: 0.5,
        };
      }),
    );
}

// The fixture briefing cites these ids; the seed points each at a story it creates, so a card's link opens a real page.
const BRIEFING_FIXTURE_STORY_IDS = [
  'cbriefts0001',
  'cbriefts0002',
  'cbriefts0003',
  'cbriefts0004',
  'cbriefts0005',
];
const briefingStoryIds = BRIEFING_FIXTURE_STORY_IDS.map((_, index) => e2eStoryId(index + 1));
/** The story the stored briefing's card links to. */
export const BRIEFING_STORY_ID = briefingStoryIds[0]!;

/** The shared fixture briefing with its story ids pointed at seeded stories; one loader for both seeded tables. */
function loadBriefingMessages() {
  const fixture = BRIEFING_FIXTURE_STORY_IDS.reduce(
    (json, fixtureId, index) => json.replaceAll(fixtureId, briefingStoryIds[index]!),
    JSON.stringify(tsToolingBriefing),
  );
  return A2uiServerMessageSchema.array().parse(JSON.parse(fixture));
}

/** A stored, complete answer to the first suggested question, so the command bar's cached replay runs in e2e without a model call. */
async function seedCopilotQuery(prisma: PrismaClient, now: Date) {
  const { question } = EXAMPLE_QUESTIONS[0];
  await prisma.copilotQuery.create({
    data: {
      question,
      questionHash: questionHash(question),
      status: 'complete',
      messages: loadBriefingMessages() as unknown as Prisma.InputJsonValue,
      storyIds: briefingStoryIds,
      // Inside the 24 h cache whenever the specs run right after seeding.
      createdAt: now,
    },
  });
}

/** The fixture briefing under each example question, retitled so the landing's tabs differ. */
function exampleBriefingMessages(title: string) {
  const messages = loadBriefingMessages();
  for (const message of messages)
    if ('updateComponents' in message)
      for (const component of message.updateComponents.components)
        if (component.id === 'root') (component as { title?: string }).title = title;
  return messages as unknown as Prisma.InputJsonValue;
}

async function seedExampleBriefings(prisma: PrismaClient) {
  await prisma.exampleBriefing.deleteMany();
  await prisma.exampleBriefing.createMany({
    data: EXAMPLE_QUESTIONS.map(({ slug, question }, position) => ({
      slug,
      question,
      position,
      messages: exampleBriefingMessages(`Example ${position + 1}: ${question}`),
    })),
  });
}

async function seedSummary(
  prisma: PrismaClient,
  storyId: string,
  consensus: Prisma.InputJsonValue | typeof Prisma.DbNull,
  basedOnComments: number,
) {
  const fields = {
    tldr: SUMMARY_TLDR,
    consensus,
    suggestedTags: [],
    basedOnComments,
    trigger: 'auto' as const,
    model: 'claude-haiku-5-5',
    promptVersion: 1,
    inputTokens: 1800,
    outputTokens: 240,
    costUsd: '0.000300',
  };
  await prisma.summary.upsert({
    where: { storyId },
    create: { storyId, ...fields },
    update: fields,
  });
}

/** Throws unless the database is marked as a throwaway one (name ends in `_test` or `e2e`) or the run opts in. */
export function assertDestructiveSeedAllowed(databaseUrl: string, allowDestructive: boolean) {
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (allowDestructive || /(_test|e2e)$/.test(databaseName)) return;
  throw new Error(
    `db:seed:e2e deletes every story and save, and "${databaseName}" is not an e2e database (its name must end in "_test" or "e2e"). Set ALLOW_DESTRUCTIVE_SEED=1 to run it anyway.`,
  );
}

/** Replaces all stories, saves and copilot answers with the fixture ones and resets every source to freshly fetched and closed. */
export async function seedE2e(prisma: PrismaClient, now = new Date()) {
  await seedSources(prisma);
  // Leftovers (e.g. from integration tests sharing the CI database) would break the exact counts specs rely on.
  // Saves go first: they restrict deleting their story.
  await prisma.$transaction([
    prisma.save.deleteMany(),
    prisma.story.deleteMany(),
    prisma.cluster.deleteMany(),
    prisma.tagDailyStat.deleteMany(),
    prisma.copilotQuery.deleteMany(),
  ]);
  await prisma.tagDailyStat.createMany({ data: buildTagDailyStats(now) });
  // The cluster row goes first: its stories point at it.
  await prisma.cluster.create({
    data: {
      id: CLUSTER_ID,
      representativeStoryId: CLUSTER_REPRESENTATIVE_ID,
      memberCount: 3,
      sourceKinds: ['hn', 'devto', 'rss'],
      rankScore: -1,
    },
  });
  for (const seed of [...buildStorySeeds(now), ...buildClusterSeeds(now)]) {
    await seedStory(prisma, seed);
  }
  await seedSummary(
    prisma,
    SUMMARISED_STORY_ID,
    { verdict: 'mixed', pros: ['Fixture pro.'], cons: ['Fixture con.'], basedOnComments: 12 },
    12,
  );
  await seedSummary(prisma, SUMMARISED_NO_CONSENSUS_STORY_ID, Prisma.DbNull, 3);
  await seedCopilotQuery(prisma, now);
  await seedExampleBriefings(prisma);
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
