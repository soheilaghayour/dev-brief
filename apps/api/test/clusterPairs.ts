import { readFileSync } from 'node:fs';
import { normalizeTitle, rankClusterCandidates } from '@devbrief/shared';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  buildClusterMatchPrompt,
  clusterMatchSchema,
  SYSTEM_PROMPT,
} from '../src/modules/llm/prompts/clusterMatch.v1.js';
import type { LlmRecording } from './promptInjection.js';

export type PairStory = {
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string;
  sourceKind: 'hn' | 'devto' | 'rss' | 'github';
};

/** A hand-labelled pair: `b` is the new story, `a` the story already in the window. */
export type ClusterPair = {
  id: string;
  label: 'same' | 'different';
  why: string;
  a: PairStory;
  b: PairStory;
};

/** The recorded replies, one per pair that passes the pre-filter, keyed by pair id. */
export type PairsRecording = Omit<LlmRecording, 'reply'> & {
  replies: Record<string, LlmRecording['reply']>;
};

export const CLUSTER_PAIRS_FIXTURE = new URL('./fixtures/cluster-pairs.json', import.meta.url);
export const CLUSTER_PAIRS_RECORDING = new URL(
  './fixtures/llm/clusterMatch.v1.pairs.json',
  import.meta.url,
);

export const readClusterPairs = () =>
  JSON.parse(readFileSync(CLUSTER_PAIRS_FIXTURE, 'utf8')) as ClusterPair[];

export const readPairsRecording = () =>
  JSON.parse(readFileSync(CLUSTER_PAIRS_RECORDING, 'utf8')) as PairsRecording;

/** `similarity()` of the two normalised titles, from the same Postgres function the step uses. */
export async function titleSimilarity(prisma: PrismaClient, titleA: string, titleB: string) {
  const [row] = await prisma.$queryRaw<{ trgm: number }[]>`
    SELECT similarity(${normalizeTitle(titleA)}, ${normalizeTitle(titleB)})::float8 AS trgm`;
  return row?.trgm ?? 0;
}

/** The model request of a pair, or null when the pre-filter cuts it and no call would be made. */
export function pairRequest(pair: ClusterPair, trgm: number) {
  const [candidate] = rankClusterCandidates(
    { id: 'b', title: pair.b.title, url: pair.b.url, publishedAt: new Date(pair.b.publishedAt) },
    [
      {
        id: 'a',
        title: pair.a.title,
        url: pair.a.url,
        publishedAt: new Date(pair.a.publishedAt),
        clusterId: null,
        clusterMemberCount: null,
        trgm,
      },
    ],
  );
  if (!candidate) return null;
  const promptStory = (story: PairStory) => ({
    title: story.title,
    domain: new URL(story.url).hostname,
    publishedAt: new Date(story.publishedAt),
    excerpt: story.excerpt,
  });
  return {
    system: SYSTEM_PROMPT,
    prompt: buildClusterMatchPrompt(promptStory(pair.b), [promptStory(pair.a)]),
    schema: clusterMatchSchema(['c1']),
  };
}
