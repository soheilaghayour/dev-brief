import { describe, expect, it } from 'vitest';
import { seedSources } from '../../src/cli/seedSources.js';
import { useTestDatabase } from './testDatabase.js';

describe('source seed', () => {
  const prisma = useTestDatabase();

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
});
