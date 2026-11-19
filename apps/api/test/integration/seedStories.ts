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
