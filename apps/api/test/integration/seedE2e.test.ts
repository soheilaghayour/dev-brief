import { describe, expect, it } from 'vitest';
import { TAG_SLUGS } from '@devbrief/shared';
import {
  assertDestructiveSeedAllowed,
  CLUSTER_ID,
  CLUSTER_MEMBER_IDS,
  CLUSTER_REPRESENTATIVE_ID,
  seedE2e,
  SUMMARISED_NO_CONSENSUS_STORY_ID,
  SUMMARISED_STORY_ID,
} from '../../prisma/seedE2e.js';
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

  it('gives one story a stored summary with consensus and another one without', async () => {
    await seedE2e(prisma, now);

    const withConsensus = await prisma.summary.findUniqueOrThrow({
      where: { storyId: SUMMARISED_STORY_ID },
    });
    const withoutConsensus = await prisma.summary.findUniqueOrThrow({
      where: { storyId: SUMMARISED_NO_CONSENSUS_STORY_ID },
    });
    expect(withConsensus.consensus).toMatchObject({ verdict: 'mixed', basedOnComments: 12 });
    expect(withoutConsensus.consensus).toBeNull();
    expect(await prisma.summary.count()).toBe(2);
  });

  it('seeds one 3-member cluster whose only primary is the representative, and reseeds it', async () => {
    await seedE2e(prisma, now);
    await seedE2e(prisma, now);

    const cluster = await prisma.cluster.findUniqueOrThrow({
      where: { id: CLUSTER_ID },
      include: { stories: true },
    });
    expect(await prisma.cluster.count()).toBe(1);
    expect(cluster.memberCount).toBe(3);
    expect(cluster.representativeStoryId).toBe(CLUSTER_REPRESENTATIVE_ID);
    expect(cluster.stories.map(({ id }) => id).sort()).toEqual(
      [CLUSTER_REPRESENTATIVE_ID, ...CLUSTER_MEMBER_IDS].sort(),
    );
    expect(cluster.stories.filter(({ isPrimary }) => isPrimary).map(({ id }) => id)).toEqual([
      CLUSTER_REPRESENTATIVE_ID,
    ]);
  });

  it('removes stories that are not fixtures', async () => {
    await prisma.story.create({
      data: {
        canonicalUrl: 'https://stray.example.com/post',
        url: 'https://stray.example.com/post',
        domain: 'stray.example.com',
        title: 'Stray',
        normalizedTitle: 'stray',
        publishedAt: now,
        tags: [],
        taggerVersion: 1,
      },
    });

    await seedE2e(prisma, now);

    expect(await prisma.story.findFirst({ where: { title: 'Stray' } })).toBeNull();
  });

  it('is idempotent: a second run adds no rows', async () => {
    await seedE2e(prisma, now);
    const counts = async () => [await prisma.story.count(), await prisma.sourceItem.count()];
    const before = await counts();

    await seedE2e(prisma, now);

    expect(await counts()).toEqual(before);
  });

  it('succeeds when a save exists and closes a source whose circuit is open', async () => {
    await seedE2e(prisma, now);
    const story = await prisma.story.findFirstOrThrow();
    await prisma.user.create({ data: { id: 'u1', name: 'U', email: 'u@example.com' } });
    await prisma.save.create({ data: { userId: 'u1', storyId: story.id } });
    await prisma.source.updateMany({
      data: { circuitOpenUntil: new Date(now.getTime() + 3_600_000), consecutiveFailures: 5 },
    });

    await seedE2e(prisma, now);

    expect(await prisma.save.count()).toBe(0);
    const sources = await prisma.source.findMany();
    expect(sources.every(({ circuitOpenUntil }) => circuitOpenUntil === null)).toBe(true);
    expect(sources.every(({ consecutiveFailures }) => consecutiveFailures === 0)).toBe(true);
  });

  it('marks every source healthy', async () => {
    await seedE2e(prisma, now);
    const sources = await prisma.source.findMany();
    expect(sources.every(({ lastSuccessAt }) => lastSuccessAt?.getTime() === now.getTime())).toBe(
      true,
    );
  });
});

describe('assertDestructiveSeedAllowed', () => {
  const url = (name: string) => `postgresql://u:p@localhost:5432/${name}`;

  it('refuses a database that is not marked as a throwaway one', () => {
    expect(() => assertDestructiveSeedAllowed(url('devbrief'), false)).toThrow(
      /not an e2e database/,
    );
  });

  it('allows names ending in _test or e2e, or an explicit opt-in', () => {
    expect(() => assertDestructiveSeedAllowed(url('devbrief_test'), false)).not.toThrow();
    expect(() => assertDestructiveSeedAllowed(url('devbrief_e2e'), false)).not.toThrow();
    expect(() => assertDestructiveSeedAllowed(url('devbrief'), true)).not.toThrow();
  });
});
