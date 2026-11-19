import { describe, expect, it } from 'vitest';
import { TAG_SLUGS } from '@devbrief/shared';
import { seedE2e } from '../../prisma/seedE2e.js';
import { useTestDatabase } from './testDatabase.js';

describe('end-to-end seed', () => {
  const prisma = useTestDatabase();
  const now = new Date('2026-11-19T12:00:00Z');

  it('seeds more than two feed pages, one story outside the Top window and valid tags', async () => {
    await seedE2e(prisma, now);

    const stories = await prisma.story.findMany({ include: { items: true } });
    expect(stories.length).toBeGreaterThan(40);
    const topWindowStart = now.getTime() - 7 * 24 * 3_600_000;
    expect(
      stories.filter(({ publishedAt }) => publishedAt.getTime() < topWindowStart),
    ).toHaveLength(1);
    for (const story of stories) {
      expect(story.items.length).toBeGreaterThan(0);
      expect(story.tags.every((tag) => (TAG_SLUGS as readonly string[]).includes(tag))).toBe(true);
    }
  });

  it('is idempotent: a second run adds no rows', async () => {
    await seedE2e(prisma, now);
    const counts = async () => [await prisma.story.count(), await prisma.sourceItem.count()];
    const before = await counts();

    await seedE2e(prisma, now);

    expect(await counts()).toEqual(before);
  });

  it('marks every source healthy', async () => {
    await seedE2e(prisma, now);
    const sources = await prisma.source.findMany();
    expect(sources.every(({ lastSuccessAt }) => lastSuccessAt?.getTime() === now.getTime())).toBe(
      true,
    );
  });
});
