import type { TestingModule } from '@nestjs/testing';
import { CLUSTER_CANDIDATE_MIN_SCORE, CLUSTER_MIN_CONFIDENCE } from '@devbrief/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { modelReply } from '../mockLanguageModel.js';
import {
  type ClusterPair,
  pairRequest,
  readClusterPairs,
  readPairsRecording,
  titleSimilarity,
} from '../clusterPairs.js';
import { createClusteringModule, runContext, seedStory } from './clusteringTestModule.js';
import { createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const pairs = readClusterPairs();
const recording = readPairsRecording();
const positives = pairs.filter(({ label }) => label === 'same');

describe('cluster accuracy fixture', () => {
  const prisma = useTestDatabase();
  const sourceIds = new Map<string, string>();
  let moduleRef: TestingModule | undefined;
  let currentReply: ClusterPairReply | undefined;
  let step: Awaited<ReturnType<typeof createClusteringModule>>['step'];

  type ClusterPairReply = (typeof recording.replies)[string];

  beforeAll(async () => {
    for (const kind of ['hn', 'devto', 'rss', 'github'] as const) {
      sourceIds.set(kind, (await createSource(prisma, kind, kind)).id);
    }
    const created = await createClusteringModule({
      doGenerate: async () => {
        if (!currentReply)
          throw new Error('The model was called for a pair with no recorded reply');
        return currentReply as ReturnType<typeof modelReply>;
      },
    });
    moduleRef = created.moduleRef;
    step = created.step;
  });

  afterAll(() => moduleRef?.close());

  async function candidateCount(pair: ClusterPair) {
    return pairRequest(pair, await titleSimilarity(prisma, pair.a.title, pair.b.title)) ? 1 : 0;
  }

  /** Runs the pair end to end with `a` as the only window story; true when `b` joined it. */
  async function clustersTogether(pair: ClusterPair, reply = recording.replies[pair.id]) {
    await prisma.llmUsage.deleteMany();
    await prisma.story.deleteMany();
    await prisma.cluster.deleteMany();
    const seed = (story: ClusterPair['a'], fresh: boolean) =>
      seedStory(prisma, {
        title: story.title,
        url: story.url,
        excerpt: story.excerpt,
        publishedAt: new Date(story.publishedAt),
        sourceId: sourceIds.get(story.sourceKind) ?? '',
        fresh,
      });
    await seed(pair.a, false);
    const newStory = await seed(pair.b, true);
    currentReply = reply;
    if (!currentReply && (await candidateCount(pair)) > 0) {
      throw new Error(`The recording has no reply for pair ${pair.id}`);
    }

    await step.run(runContext());

    const stored = await prisma.story.findUniqueOrThrow({ where: { id: newStory.id } });
    return stored.clusterId !== null;
  }

  it('AC-2.1.1 names the floor and the confidence as constants', () => {
    expect([CLUSTER_CANDIDATE_MIN_SCORE, CLUSTER_MIN_CONFIDENCE]).toEqual([0.2, 0.8]);
  });

  it('is hand-labelled with at least 20 positive and 20 negative pairs, hard negatives included', () => {
    expect(positives.length).toBeGreaterThanOrEqual(20);
    expect(pairs.length - positives.length).toBeGreaterThanOrEqual(20);
    const ids = pairs.map(({ id }) => id);
    expect(ids).toEqual(expect.arrayContaining(['react-19-1-vs-19-2']));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('AC-2.1.1 passes at least 95% of the positive pairs through the pre-filter, with no model involved', async () => {
    let passed = 0;
    const cut: string[] = [];
    for (const pair of positives) {
      if ((await candidateCount(pair)) > 0) passed += 1;
      else cut.push(pair.id);
    }
    expect(passed / positives.length, `cut by the floor: ${cut.join(', ')}`).toBeGreaterThanOrEqual(
      0.95,
    );
  });

  it('runs a pair end to end: the reply decides whether the new story joins', async () => {
    const pair = positives.find(({ id }) => id === 'typescript-6-1-release');
    if (!pair) throw new Error('fixture pair missing');
    const reply = (body: unknown) => {
      const { content, finishReason, usage, warnings } = modelReply(body);
      return { content, finishReason, usage, warnings };
    };

    expect(await clustersTogether(pair, reply({ match: 'c1', confidence: 0.95 }))).toBe(true);
    expect(await clustersTogether(pair, reply({ match: 'c1', confidence: 0.5 }))).toBe(false);
    expect(await clustersTogether(pair, reply({ match: 'none', confidence: 0.95 }))).toBe(false);
  });

  const recorded = it.skipIf(recording.placeholder === true);
  beforeAll(() => {
    if (!recording.placeholder) return;
    // Straight to stderr: the default reporter hides console output of a passing file.
    process.stderr.write(
      '\nWARNING, 1 test SKIPPED: the cluster-pairs recording is still a placeholder, so AC-2.1.1 precision and recall are unproven. Record it before FEATURE_CLUSTERS goes on (issue #82, apps/api/test/fixtures/llm/README.md).\n\n',
    );
  });

  recorded(
    'AC-2.1.1 reaches precision 0.90 and recall 0.70 with the recorded replies',
    async () => {
      let truePositives = 0;
      let falsePositives = 0;
      let missed = 0;
      for (const pair of pairs) {
        const clustered = await clustersTogether(pair);
        if (pair.label === 'same') {
          if (clustered) truePositives += 1;
          else missed += 1;
        } else if (clustered) {
          falsePositives += 1;
        }
      }
      const precision = truePositives / (truePositives + falsePositives);
      const recall = truePositives / (truePositives + missed);
      process.stderr.write(`\nclusterMatch.v1: precision ${precision}, recall ${recall}\n`);
      expect(precision).toBeGreaterThanOrEqual(0.9);
      expect(recall).toBeGreaterThanOrEqual(0.7);
    },
    60_000,
  );
});
