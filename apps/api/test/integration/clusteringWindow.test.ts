import { readFileSync } from 'node:fs';
import type { TestingModule } from '@nestjs/testing';
import { normalizeTitle } from '@devbrief/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmService } from '../../src/modules/llm/llm.service.js';
import { modelReply } from '../mockLanguageModel.js';
import { CLUSTERING_ON, createClusteringModule, runContext } from './clusteringTestModule.js';
import { useTestDatabase } from './testDatabase.js';

const WINDOW_STORIES = 1_200;
const NEW_STORIES = 400;

// A realistic window gives more than 100 of 400 new stories a candidate, so the per-run maximum would end the step early;
// lifting it here makes the run score every new story. clustering.test.ts checks the maximum itself.
vi.mock('../../src/modules/clustering/clusteringRules.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/modules/clustering/clusteringRules.js')>()),
  // vi.mock is hoisted above the constants, so this is NEW_STORIES written out.
  CLUSTER_MAX_CALLS_PER_RUN: 400,
}));

describe('clustering step on a realistic window', () => {
  const prisma = useTestDatabase();
  let moduleRef: TestingModule | undefined;

  afterEach(() => moduleRef?.close());

  it('AC-2.1.2 adds at most 5 s to a run of 400 new items against a ±72 h window of 1,200 stories, with at most one call per story', async () => {
    const now = Date.now();
    const HOUR_MS = 3_600_000;
    const titles = realisticTitles(WINDOW_STORIES + NEW_STORIES);
    const stories = titles.map((title, index) => {
      const isNew = index >= WINDOW_STORIES;
      const url = `https://news${index % 40}.example.com/${index}-${slugOf(title)}`;
      return {
        canonicalUrl: url,
        url,
        domain: `news${index % 40}.example.com`,
        title,
        normalizedTitle: normalizeTitle(title),
        // Existing stories spread over the 72 h before the run; the new ones over the last day.
        publishedAt: new Date(
          isNew
            ? now - ((index - WINDOW_STORIES) / NEW_STORIES) * 24 * HOUR_MS
            : now - (index / WINDOW_STORIES) * 72 * HOUR_MS,
        ),
        firstSeenAt: isNew ? new Date(now) : new Date(now - 2 * HOUR_MS),
        tags: [],
        taggerVersion: 1,
      };
    });
    await prisma.story.createMany({ data: stories });
    const created = await createClusteringModule({
      doGenerate: async () => modelReply({ match: 'none', confidence: 0.9 }),
      // The calls would pass the daily cap, which a run of this size is not meant to test.
      env: { ...CLUSTERING_ON, LLM_CAP_CLUSTER_USD_DAY: '1', LLM_CAP_GLOBAL_USD_DAY: '1' },
    });
    moduleRef = created.moduleRef;

    // The ledger's reserve and settle belong to the model call, so the clock stops while LlmService works.
    const llm = created.moduleRef.get(LlmService);
    const generate = llm.generateStructured.bind(llm);
    let modelCallMs = 0;
    llm.generateStructured = async (request) => {
      const callStarted = performance.now();
      try {
        return await generate(request);
      } finally {
        modelCallMs += performance.now() - callStarted;
      }
    };

    const started = performance.now();
    await created.step.run({ ...runContext(), startedAt: new Date(now - 60_000) });
    const nonLlmMs = performance.now() - started - modelCallMs;
    const calls = created.model.doGenerateCalls.length;
    process.stderr.write(
      `\nclustering 400 new + 1,200 window stories: ${nonLlmMs.toFixed(0)} ms non-LLM, ${calls} model calls\n`,
    );

    const refIds = (await prisma.llmUsage.findMany({ select: { refId: true } })).map(
      ({ refId }) => refId,
    );
    expect(calls).toBeGreaterThan(0);
    expect(refIds).toHaveLength(calls);
    expect(new Set(refIds).size).toBe(calls);
    expect(calls).toBeLessThanOrEqual(NEW_STORIES);
    expect(nonLlmMs).toBeLessThan(5_000);
  }, 60_000);
});

const slugOf = (title: string) => title.toLowerCase().replaceAll(/\W+/g, '-');

const SYLLABLES =
  'ba be bi bo bu ka ke ki ko ku la le li lo lu ma me mi mo mu na ne ni no nu ra re ri ro ru sa se si so su ta te ti to tu va ve vi vo vu'.split(
    ' ',
  );
// Share of title words that come from real headlines; the rest are invented names, as a real window is full of one-off names.
const REAL_WORD_SHARE = 0.4;

/** Titles of 5 to 10 words, drawn with a fixed seed: some words from the recorded HN and Dev.to headlines, the rest invented names, so some new stories find candidates and most do not. */
function realisticTitles(count: number) {
  const recorded = (name: string) =>
    JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as unknown;
  const hnTitles = Object.values(
    recorded('hn/items.json') as Record<string, { title?: string }>,
  ).flatMap(({ title }) => (title ? [title] : []));
  const devtoTitles = (recorded('devto/top.json') as { title: string }[]).map(({ title }) => title);
  const realWords = [...hnTitles, ...devtoTitles].flatMap(
    (title) => title.match(/[\p{L}\p{N}]{6,}/gu) ?? [],
  );
  let state = 7;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
  const pick = <Item>(items: readonly Item[]) => items[Math.floor(random() * items.length)] as Item;
  const inventedName = () => {
    const name = Array.from({ length: 2 + Math.floor(random() * 3) }, () => pick(SYLLABLES)).join(
      '',
    );
    return random() < 0.4 ? name.charAt(0).toUpperCase() + name.slice(1) : name;
  };
  return Array.from({ length: count }, () =>
    Array.from({ length: 5 + Math.floor(random() * 6) }, () =>
      random() < REAL_WORD_SHARE ? pick(realWords) : inventedName(),
    ).join(' '),
  );
}
