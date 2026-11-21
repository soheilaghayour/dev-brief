import { beforeEach, describe, expect, it } from 'vitest';
import { seedSources } from '../../src/cli/seedSources.js';
import { createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

describe('source seed', () => {
  const prisma = useTestDatabase();

  beforeEach(() => prisma.$executeRawUnsafe('TRUNCATE "Story", "Source" RESTART IDENTITY CASCADE'));

  it('seeds all 13 sources, RSS ones with a feedUrl', async () => {
    await seedSources(prisma);

    const sources = await prisma.source.findMany({ orderBy: { slug: 'asc' } });
    expect(sources).toHaveLength(13);
    expect(sources.filter(({ kind }) => kind !== 'rss').map(({ slug }) => slug)).toEqual([
      'devto',
      'github',
      'hn',
    ]);
    const rssSources = sources.filter(({ kind }) => kind === 'rss');
    expect(rssSources).toHaveLength(10);
    for (const { slug, feedUrl } of rssSources) {
      expect(slug).toMatch(/^rss-/);
      expect(feedUrl).toMatch(/^https:\/\//);
    }
  });

  it('is idempotent: a second run gives the same rows', async () => {
    await seedSources(prisma);
    const before = await prisma.source.findMany({ orderBy: { slug: 'asc' } });

    await seedSources(prisma);
    const after = await prisma.source.findMany({ orderBy: { slug: 'asc' } });

    // Upsert touches @updatedAt even when nothing changed; every other column must stay equal.
    expect(after).toEqual(before.map((source) => ({ ...source, updatedAt: expect.any(Date) })));
  });

  it('seeds every RSS source off and every other source on', async () => {
    await seedSources(prisma);

    const sources = await prisma.source.findMany();
    for (const { kind, enabled } of sources) expect(enabled).toBe(kind !== 'rss');
  });

  it('switches off an RSS row that is already enabled, and a second run changes nothing', async () => {
    await createSource(prisma, 'rss-react-blog', 'rss', {
      feedUrl: 'https://react.dev/rss.xml',
      enabled: true,
    });

    await seedSources(prisma);
    expect(
      await prisma.source.findUniqueOrThrow({ where: { slug: 'rss-react-blog' } }),
    ).toMatchObject({ enabled: false });

    const before = await prisma.source.findMany({ orderBy: { slug: 'asc' } });
    await seedSources(prisma);
    const after = await prisma.source.findMany({ orderBy: { slug: 'asc' } });
    expect(after).toEqual(before.map((source) => ({ ...source, updatedAt: expect.any(Date) })));
  });

  it('reverts an enabled flag changed only in the database, so sources.json is the only switch', async () => {
    await seedSources(prisma);
    await prisma.source.update({ where: { slug: 'hn' }, data: { enabled: false } });

    await seedSources(prisma);

    expect(await prisma.source.findUniqueOrThrow({ where: { slug: 'hn' } })).toMatchObject({
      enabled: true,
    });
  });

  it('keeps the stories of a switched-off source', async () => {
    const source = await createSource(prisma, 'rss-react-blog', 'rss', { enabled: true });
    await createStory(prisma, {
      title: 'An old React post',
      publishedAt: new Date(),
      itemSourceIds: [source.id],
    });

    await seedSources(prisma);

    expect(await prisma.story.count()).toBe(1);
    expect(await prisma.sourceItem.count()).toBe(1);
  });
});
