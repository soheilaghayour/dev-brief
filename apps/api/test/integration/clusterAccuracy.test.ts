import type { TestingModule } from '@nestjs/testing';
import {
  CLUSTER_CANDIDATE_MIN_SCORE,
  CLUSTER_MIN_CONFIDENCE,
  canonicalizeUrl,
  normalizeTitle,
  sameLink,
} from '@devbrief/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { modelReply } from '../mockLanguageModel.js';
import {
  type ClusterPair,
  pairRequest,
  readClusterPairs,
  readHeldOutPairs,
  readPairsRecording,
  requestHash,
} from '../clusterPairs.js';
import { createClusteringModule, runContext, seedStory } from './clusteringTestModule.js';
import { createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const pairs = readClusterPairs();
const heldOutPairs = readHeldOutPairs();
const recording = readPairsRecording();
const positives = pairs.filter(({ label }) => label === 'same');
const TITLE_DEDUP_WINDOW_MS = 72 * 60 * 60 * 1000;

const reachesModel = (pair: ClusterPair) => pairRequest(pair) !== null;

function passRate(set: readonly ClusterPair[]) {
  const passed = set.filter(reachesModel);
  return { passed: passed.length, rate: passed.length / set.length };
}

describe('cluster pair fixtures', () => {
  it('are hand-labelled: at least 20 positive and 20 negative pairs, plus at least 30 held-out pairs with 12 positives, with unique ids', () => {
    expect(positives.length).toBeGreaterThanOrEqual(20);
    expect(pairs.length - positives.length).toBeGreaterThanOrEqual(20);
    expect(heldOutPairs.length).toBeGreaterThanOrEqual(30);
    expect(heldOutPairs.filter(({ label }) => label === 'same').length).toBeGreaterThanOrEqual(12);
    const ids = [...pairs, ...heldOutPairs].map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['react-19-1-vs-19-2']));
  });

  it("mirror what ingestion produces: no pair would be merged into one Story, and each source has its adapter's shape", () => {
    const problems: string[] = [];
    for (const pair of [...pairs, ...heldOutPairs]) {
      const { a, b } = pair;
      if (canonicalizeUrl(a.url) === canonicalizeUrl(b.url)) problems.push(`${pair.id}: same URL`);
      const apart = Math.abs(Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
      if (normalizeTitle(a.title) === normalizeTitle(b.title) && apart <= TITLE_DEDUP_WINDOW_MS) {
        problems.push(`${pair.id}: same title in the window`);
      }
      if (apart > TITLE_DEDUP_WINDOW_MS) problems.push(`${pair.id}: outside the window`);
      for (const story of [a, b]) {
        if (story.sourceKind === 'hn' && story.excerpt !== null) {
          problems.push(`${pair.id}: an HN story has no excerpt`);
        }
        if (story.sourceKind === 'github') {
          const { pathname, hostname } = new URL(story.url);
          const [owner, repo] = pathname.split('/').filter(Boolean);
          const ok =
            story.excerpt === null &&
            hostname === 'github.com' &&
            story.title.startsWith(`${owner}/${repo}`);
          if (!ok) problems.push(`${pair.id}: a GitHub story is the repository`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('AC-2.1.1 keeps a positive whose two URLs sameLink joins and ingestion keeps apart', () => {
    const joined = positives.filter(({ a, b }) => sameLink(a.url, b.url));
    expect(joined.map(({ id }) => id)).toContain('loom-launch');
  });

  it('has hard negatives that reach the model, not only negatives the pre-filter cuts', () => {
    const reaching = pairs.filter((pair) => pair.label === 'different' && reachesModel(pair));
    const injected = reaching.filter(({ id }) => id.startsWith('injection-'));
    // Informational: a cut negative never tests the model, so only these count as hard negatives.
    process.stderr.write(
      `\ncluster pairs: ${pairs.filter(reachesModel).length} of ${pairs.length} reach the model, ${reaching.length} of them negatives\n`,
    );
    expect(reaching.length).toBeGreaterThanOrEqual(8);
    expect(injected.length).toBeGreaterThanOrEqual(1);
  });
});

describe('cluster accuracy fixture', () => {
  const prisma = useTestDatabase();
  const sourceIds = new Map<string, string>();
  let moduleRef: TestingModule | undefined;
  let currentReply: (typeof recording.replies)[string] | undefined;
  let step: Awaited<ReturnType<typeof createClusteringModule>>['step'];

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
    if (!currentReply && reachesModel(pair)) {
      throw new Error(`The recording has no reply for pair ${pair.id}`);
    }

    await step.run(runContext());

    const stored = await prisma.story.findUniqueOrThrow({ where: { id: newStory.id } });
    return stored.clusterId !== null;
  }

  async function measure(set: readonly ClusterPair[]) {
    let truePositives = 0;
    let falsePositives = 0;
    let missed = 0;
    for (const pair of set) {
      const clustered = await clustersTogether(pair);
      if (pair.label === 'same') {
        if (clustered) truePositives += 1;
        else missed += 1;
      } else if (clustered) {
        falsePositives += 1;
      }
    }
    return {
      precision: truePositives / (truePositives + falsePositives),
      recall: truePositives / (truePositives + missed),
    };
  }

  it('AC-2.1.1 names the floor and the confidence as constants', () => {
    expect([CLUSTER_CANDIDATE_MIN_SCORE, CLUSTER_MIN_CONFIDENCE]).toEqual([0.2, 0.8]);
  });

  it('AC-2.1.1 passes at least 95% of the positive pairs through the pre-filter, with no model involved', () => {
    const cut = positives.filter((pair) => !reachesModel(pair)).map(({ id }) => id);
    const { rate } = passRate(positives);
    expect(rate, `cut by the floor: ${cut.join(', ')}`).toBeGreaterThanOrEqual(0.95);
  });

  it('reports the pre-filter pass rate of the held-out pairs, which is not a gate', () => {
    const positiveSet = heldOutPairs.filter(({ label }) => label === 'same');
    const held = passRate(positiveSet);
    const all = passRate(heldOutPairs);
    process.stderr.write(
      `\nheld-out pairs: ${held.passed} of ${positiveSet.length} positives and ${all.passed} of ${heldOutPairs.length} pairs pass the pre-filter\n`,
    );
    expect(heldOutPairs.length).toBeGreaterThan(0);
  });

  it('has a recording made for the current prompt and pairs', () => {
    const stale = [...pairs, ...heldOutPairs].flatMap((pair) => {
      const request = pairRequest(pair);
      return request && recording.requestHashes[pair.id] !== requestHash(request) ? [pair.id] : [];
    });
    expect(
      stale,
      'The recording answers a different request. Do not tune and re-record: tell the orchestrator or the owner (#82).',
    ).toEqual([]);
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
      const { precision, recall } = await measure(pairs);
      process.stderr.write(`\nclusterMatch.v1: precision ${precision}, recall ${recall}\n`);
      expect(precision).toBeGreaterThanOrEqual(0.9);
      expect(recall).toBeGreaterThanOrEqual(0.7);
      const heldOut = await measure(heldOutPairs);
      process.stderr.write(
        `clusterMatch.v1 held out: precision ${heldOut.precision}, recall ${heldOut.recall}\n`,
      );
    },
    120_000,
  );
});
