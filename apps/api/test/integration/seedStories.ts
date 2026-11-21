import type { PrismaClient, SourceKind } from '../../src/generated/prisma/client.js';

export function createSource(
  prisma: PrismaClient,
  slug: string,
  kind: SourceKind,
  overrides: Partial<Parameters<PrismaClient['source']['create']>[0]['data']> = {},
) {
  return prisma.source.create({
    data: {
      slug,
      kind,
      name: `${slug} name`,
      siteUrl: `https://${slug}.example.com`,
      ...overrides,
    },
  });
}

type StoryOptions = {
  /** Set only where a test needs to know the id tiebreak. */
  id?: string;
  title: string;
  publishedAt: Date;
  rankScore?: number;
  tags?: string[];
  excerpt?: string;
  /** One SourceItem per entry, on the source with that id. */
  itemSourceIds: string[];
};

/** Inserts a Story with one SourceItem per source, setting rankScore by hand. */
export async function createStory(prisma: PrismaClient, options: StoryOptions) {
  const slug = options.title.toLowerCase().replaceAll(/\W+/g, '-');
  const url = `https://example.com/${slug}`;
  return prisma.story.create({
    data: {
      id: options.id,
      canonicalUrl: url,
      url,
      domain: 'example.com',
      title: options.title,
      normalizedTitle: options.title.toLowerCase(),
      excerpt: options.excerpt,
      publishedAt: options.publishedAt,
      rankScore: options.rankScore ?? 0,
      tags: options.tags ?? [],
      taggerVersion: 1,
      items: {
        create: options.itemSourceIds.map((sourceId) => ({
          sourceId,
          externalId: `${slug}-${sourceId}`,
          url,
          canonicalUrl: url,
          discussionUrl: `https://discuss.example.com/${slug}`,
          title: options.title,
          publishedAt: options.publishedAt,
          points: 10,
          commentsCount: 2,
        })),
      },
    },
  });
}

/** Groups existing stories into a Cluster directly (the clustering step is not under test): the representative is primary, the rest are not. */
export async function createCluster(
  prisma: PrismaClient,
  options: { memberIds: string[]; representativeId: string; sourceKinds: SourceKind[] },
) {
  const cluster = await prisma.cluster.create({
    data: {
      representativeStoryId: options.representativeId,
      memberCount: options.memberIds.length,
      sourceKinds: options.sourceKinds,
    },
  });
  await prisma.story.updateMany({
    where: { id: { in: options.memberIds } },
    data: { clusterId: cluster.id, isPrimary: false },
  });
  await prisma.story.update({ where: { id: options.representativeId }, data: { isPrimary: true } });
  return cluster;
}

/** Inserts `count` bare stories (no source items) in one statement; for tests that need many saved stories fast. */
export async function createBareStories(prisma: PrismaClient, count: number, prefix: string) {
  const publishedAt = new Date(Date.UTC(2026, 0, 1));
  const rows = Array.from({ length: count }, (_, index) => {
    const url = `https://example.com/${prefix}-${index}`;
    return {
      id: `c${prefix}${String(index).padStart(6, '0')}`.padEnd(24, 'x'),
      canonicalUrl: url,
      url,
      domain: 'example.com',
      title: `${prefix} ${index}`,
      normalizedTitle: `${prefix} ${index}`,
      publishedAt,
      tags: [],
      taggerVersion: 1,
    };
  });
  await prisma.story.createMany({ data: rows });
  return rows.map((row) => row.id);
}
