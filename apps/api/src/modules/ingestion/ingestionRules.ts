import { TAXONOMY_VERSION, canonicalizeUrl, normalizeTitle, tagStory } from '@devbrief/shared';
import type { SourceKind } from '../../generated/prisma/client.js';
import type { RawItem } from './sourceAdapter.js';

export const FAILURES_TO_OPEN_CIRCUIT = 3;
export const CIRCUIT_OPEN_MS = 6 * 60 * 60 * 1000;
export const TITLE_DEDUP_WINDOW_MS = 72 * 60 * 60 * 1000;
export const MAX_ERROR_LENGTH = 500;
export const RUN_BUDGET_MESSAGE = 'Run budget of 4 min exceeded; source aborted';

export type SourceOutcome = 'success' | 'failed' | 'skipped';

export interface MappedItem {
  canonicalUrl: string;
  domain: string;
  normalizedTitle: string;
  engagement: number;
}

// Engagement per source kind, Appendix B; RSS has none and ranks by its baseline.
const ENGAGEMENT_BY_KIND = {
  hn: (item) => item.points ?? 0,
  devto: (item) => (item.reactionsCount ?? 0) + (item.commentsCount ?? 0),
  rss: () => 0,
  github: () => 0,
} satisfies Record<SourceKind, (item: RawItem) => number>;

/** Derives the dedup keys and engagement of a raw item; throws when its URL is not http(s). */
export function mapRawItem(kind: SourceKind, item: RawItem): MappedItem {
  const canonicalUrl = canonicalizeUrl(item.url);
  return {
    canonicalUrl,
    domain: new URL(canonicalUrl).hostname,
    normalizedTitle: normalizeTitle(item.title),
    engagement: ENGAGEMENT_BY_KIND[kind](item),
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

/** The overall run status: failed only when every source that ran failed, partial when some did. */
export function overallStatus(outcomes: readonly SourceOutcome[]) {
  const failed = outcomes.filter((outcome) => outcome === 'failed').length;
  if (failed === 0) return 'success' as const;
  return failed === outcomes.filter((outcome) => outcome !== 'skipped').length
    ? ('failed' as const)
    : ('partial' as const);
}

export function describeFailure(error: unknown, budgetExceeded: boolean) {
  if (budgetExceeded) return RUN_BUDGET_MESSAGE;
  return error instanceof Error ? error.message : String(error);
}
