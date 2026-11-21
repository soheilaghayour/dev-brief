import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  canonicalizeUrl,
  clusterProfile,
  normalizeTitle,
  rankClusterCandidates,
} from '@devbrief/shared';
import {
  buildClusterMatchPrompt,
  clusterMatchSchema,
  SYSTEM_PROMPT,
} from '../src/modules/llm/prompts/clusterMatch.v1.js';
import type { LlmRecording } from './promptInjection.js';

export type PairStory = {
  title: string;
  url: string;
  excerpt: string | null;
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

/** The recorded replies, one per pair that passes the pre-filter, keyed by pair id, each with the hash of the request it answers. */
export type PairsRecording = Omit<LlmRecording, 'reply' | 'requestHash'> & {
  replies: Record<string, LlmRecording['reply']>;
  requestHashes: Record<string, string>;
};

export const CLUSTER_PAIRS_FIXTURE = new URL('./fixtures/cluster-pairs.json', import.meta.url);
export const CLUSTER_PAIRS_HELD_OUT_FIXTURE = new URL(
  './fixtures/cluster-pairs.heldout.json',
  import.meta.url,
);
export const CLUSTER_PAIRS_CONFIRM_FIXTURE = new URL(
  './fixtures/cluster-pairs.confirm.json',
  import.meta.url,
);
export const CLUSTER_PAIRS_RECORDING = new URL(
  './fixtures/llm/clusterMatch.v1.pairs.json',
  import.meta.url,
);

const readPairs = (file: URL) => JSON.parse(readFileSync(file, 'utf8')) as ClusterPair[];

export const readClusterPairs = () => readPairs(CLUSTER_PAIRS_FIXTURE);

/** Real pairs labelled before the pre-filter ran on them; the pre-filter's constants were tuned on them, the prompt and `CLUSTER_MIN_CONFIDENCE` never are. */
export const readHeldOutPairs = () => readPairs(CLUSTER_PAIRS_HELD_OUT_FIXTURE);

/** Pairs labelled by the DECISIONS rule before they were scored; never tune any constant on them. */
export const readConfirmPairs = () => readPairs(CLUSTER_PAIRS_CONFIRM_FIXTURE);

export const readPairsRecording = () =>
  JSON.parse(readFileSync(CLUSTER_PAIRS_RECORDING, 'utf8')) as PairsRecording;

/** The story as the step would hold it: the URL as fetched, and the domain of its canonical URL, as ingestion stores them. */
function asStoredStory(story: PairStory, id: string) {
  return {
    id,
    title: story.title,
    url: story.url,
    domain: new URL(canonicalizeUrl(story.url)).hostname,
    publishedAt: new Date(story.publishedAt),
    excerpt: story.excerpt,
    profile: clusterProfile({ ...story, normalizedTitle: normalizeTitle(story.title) }),
  };
}

/** The model request of a pair, or null when the pre-filter cuts it and no call would be made. */
export function pairRequest(pair: ClusterPair) {
  const story = asStoredStory(pair.b, 'b');
  const other = asStoredStory(pair.a, 'a');
  const [candidate] = rankClusterCandidates(story, [
    { ...other, clusterId: null, clusterMemberCount: null },
  ]);
  if (!candidate) return null;
  return {
    system: SYSTEM_PROMPT,
    prompt: buildClusterMatchPrompt(story, [other]),
    schema: clusterMatchSchema(['c1']),
  };
}

/** Identifies the exact system prompt and user prompt a reply answers, so a changed prompt or pair makes the recording stale. */
export const requestHash = ({ system, prompt }: { system: string; prompt: string }) =>
  createHash('sha256').update(`${system}\n---\n${prompt}`).digest('hex').slice(0, 16);
