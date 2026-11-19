import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './testDatabase.js';

describe('Story full-text search vector', () => {
  const prisma = useTestDatabase();

  it('is generated on insert and matches the title (weight A) and the excerpt (weight B)', async () => {
    await prisma.story.create({
      data: {
        canonicalUrl: 'https://example.com/streaming',
        url: 'https://example.com/streaming',
        domain: 'example.com',
        title: 'Streaming rendering explained',
        normalizedTitle: 'streaming rendering explained',
        excerpt: 'A walkthrough of hydration costs',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        taggerVersion: 1,
      },
    });

    const matches = (query: string) =>
      prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Story"
        WHERE "searchVector" @@ websearch_to_tsquery('english', ${query})`;

    expect(await matches('rendering')).toHaveLength(1);
    expect(await matches('hydration')).toHaveLength(1);
    expect(await matches('kubernetes')).toHaveLength(0);

    // Weight A (title) outranks weight B (excerpt) in the generated vector.
    const [titleHit] = await prisma.$queryRaw<{ rank: number }[]>`
      SELECT ts_rank("searchVector", websearch_to_tsquery('english', 'rendering')) AS rank FROM "Story"`;
    const [excerptHit] = await prisma.$queryRaw<{ rank: number }[]>`
      SELECT ts_rank("searchVector", websearch_to_tsquery('english', 'hydration')) AS rank FROM "Story"`;
    expect(titleHit?.rank).toBeGreaterThan(excerptHit?.rank ?? Infinity);
  });
});
