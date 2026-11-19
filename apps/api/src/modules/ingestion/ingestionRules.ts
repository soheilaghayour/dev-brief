import {
  TAXONOMY_VERSION,
  canonicalizeUrl,
  itemEngagement,
  normalizeTitle,
  tagStory,
} from '@devbrief/shared';
import type { SourceKind } from '../../generated/prisma/client.js';
import type { RawItem } from './sourceAdapter.js';

export const FAILURES_TO_OPEN_CIRCUIT = 3;
export const CIRCUIT_OPEN_MS = 6 * 60 * 60 * 1000;
export const TITLE_DEDUP_WINDOW_MS = 72 * 60 * 60 * 1000;
export const MAX_ERROR_LENGTH = 500;
export const RUN_BUDGET_MESSAGE = 'Run budget exceeded; source aborted';

export type SourceOutcome = 'success' | 'failed' | 'skipped';

export interface MappedItem {
  canonicalUrl: string;
  domain: string;
  normalizedTitle: string;
  engagement: number;
}

/** Derives the dedup keys and engagement of a raw item; throws when its URL is not http(s). */
export function mapRawItem(kind: SourceKind, item: RawItem): MappedItem {
  const canonicalUrl = canonicalizeUrl(item.url);
  return {
    canonicalUrl,
    domain: new URL(canonicalUrl).hostname,
    normalizedTitle: normalizeTitle(item.title),
    engagement: itemEngagement({ kind, ...item }),
  };
}

/** Tags for a story from its title, canonical URL and the union of its items' source tags. */
export function storyTags(title: string, canonicalUrl: string, sourceTags: readonly string[]) {
  return {
    tags: tagStory({ title, url: canonicalUrl, sourceTags, categories: [] }),
    taggerVersion: TAXONOMY_VERSION,
  };
}

/** The publishedAt range in which an equal normalized title joins an existing story. */
export function titleDedupWindow(publishedAt: Date) {
  return {
    from: new Date(publishedAt.getTime() - TITLE_DEDUP_WINDOW_MS),
    to: new Date(publishedAt.getTime() + TITLE_DEDUP_WINDOW_MS),
  };
}

export function isCircuitOpen(source: { circuitOpenUntil: Date | null }, now: Date) {
  return source.circuitOpenUntil !== null && source.circuitOpenUntil > now;
}

/** The Source health fields after a run; a failure past the threshold (re-)opens the circuit for 6 h. */
export function nextSourceHealth(
  source: { consecutiveFailures: number },
  outcome: { ok: true } | { ok: false; error: string },
  now: Date,
) {
  if (outcome.ok) {
    return { consecutiveFailures: 0, circuitOpenUntil: null, lastSuccessAt: now };
  }
  const consecutiveFailures = source.consecutiveFailures + 1;
  return {
    consecutiveFailures,
    circuitOpenUntil:
      consecutiveFailures >= FAILURES_TO_OPEN_CIRCUIT
        ? new Date(now.getTime() + CIRCUIT_OPEN_MS)
        : null,
    lastErrorAt: now,
    lastError: outcome.error.slice(0, MAX_ERROR_LENGTH),
  };
}

/** The overall run status: failed only when every source that ran failed, partial when some did, skipped when none ran. */
export function overallStatus(outcomes: readonly SourceOutcome[]) {
  const ran = outcomes.filter((outcome) => outcome !== 'skipped');
  if (ran.length === 0) return 'skipped' as const;
  const failed = ran.filter((outcome) => outcome === 'failed').length;
  if (failed === 0) return 'success' as const;
  return failed === ran.length ? ('failed' as const) : ('partial' as const);
}

export function describeFailure(error: unknown, budgetExceeded: boolean) {
  if (budgetExceeded) return RUN_BUDGET_MESSAGE;
  return error instanceof Error ? error.message : String(error);
}

interface StoryState {
  tags: string[];
  taggerVersion: number;
  publishedAt: Date;
  excerpt: string | null;
  readingTimeMinutes: number | null;
}

/** The Story fields that depend on all its items; null when nothing changed. */
export function nextStoryFields(
  story: StoryState & { title: string; canonicalUrl: string },
  items: readonly { sourceTags: readonly string[]; publishedAt: Date }[],
  raw: Pick<RawItem, 'excerpt' | 'readingTimeMinutes'>,
) {
  const { tags, taggerVersion } = storyTags(
    story.title,
    story.canonicalUrl,
    items.flatMap(({ sourceTags }) => sourceTags),
  );
  const publishedAt = new Date(Math.min(...items.map((item) => item.publishedAt.getTime())));
  const excerpt = story.excerpt ?? raw.excerpt;
  const readingTimeMinutes = story.readingTimeMinutes ?? raw.readingTimeMinutes;

  const unchanged =
    taggerVersion === story.taggerVersion &&
    tags.join() === story.tags.join() &&
    publishedAt.getTime() === story.publishedAt.getTime() &&
    excerpt === story.excerpt &&
    readingTimeMinutes === story.readingTimeMinutes;
  return unchanged ? null : { tags, taggerVersion, publishedAt, excerpt, readingTimeMinutes };
}
