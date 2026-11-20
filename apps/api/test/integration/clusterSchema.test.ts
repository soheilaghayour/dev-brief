import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './testDatabase.js';

describe('cluster schema', () => {
  const prisma = useTestDatabase();

  it('installs pg_trgm: similarity() of two related titles is in (0, 1]', async () => {
    const [row] = await prisma.$queryRaw<{ score: number }[]>`
      SELECT similarity('typescript 7 native compiler preview', 'typescript native compiler preview released') AS score`;
    expect(row?.score).toBeGreaterThan(0);
    expect(row?.score).toBeLessThanOrEqual(1);
  });

  it('indexes normalizedTitle with a trigram GIN index', async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'Story_normalizedTitle_trgm_idx'`;
    expect(rows[0]?.indexdef).toMatch(/USING gin .*gin_trgm_ops/);
  });

  it('reads a story inserted without cluster columns as primary and unclustered', async () => {
    await prisma.$executeRaw`
      INSERT INTO "Story" ("id", "canonicalUrl", "url", "domain", "title", "normalizedTitle", "publishedAt", "tags", "taggerVersion")
      VALUES ('old-story', 'https://example.com/a', 'https://example.com/a', 'example.com', 'A', 'a', now(), '{}', 1)`;

    const story = await prisma.story.findUniqueOrThrow({ where: { id: 'old-story' } });

    expect(story).toMatchObject({ isPrimary: true, clusterId: null, clusterScore: null });
  });

  it('sets a member story back to unclustered when its cluster is deleted', async () => {
    const cluster = await prisma.cluster.create({
      data: { representativeStoryId: 'old-story', memberCount: 1, sourceKinds: ['hn'] },
    });
    await prisma.story.update({
      where: { id: 'old-story' },
      data: { clusterId: cluster.id, isPrimary: false, clusterScore: 0.9 },
    });

    await prisma.cluster.delete({ where: { id: cluster.id } });

    const story = await prisma.story.findUniqueOrThrow({ where: { id: 'old-story' } });
    expect(story.clusterId).toBeNull();
  });
});
