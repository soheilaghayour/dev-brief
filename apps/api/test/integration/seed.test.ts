import { describe, expect, it } from 'vitest';
import { seedSources } from '../../prisma/seed.js';
import { useTestDatabase } from './testDatabase.js';

describe('source seed', () => {
  const prisma = useTestDatabase();

  it('seeds all 12 Phase 1 sources, RSS ones with a feedUrl', async () => {
    await seedSources(prisma);

    const sources = await prisma.source.findMany({ orderBy: { slug: 'asc' } });
    expect(sources).toHaveLength(12);
    expect(sources.filter(({ kind }) => kind === 'hn' || kind === 'devto')).toHaveLength(2);
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
