const MS_PER_DAY = 86_400_000;

const TAG_STAT_DAYS = 3;
const STORY_RETENTION_DAYS = 90;
const INGESTION_RUN_RETENTION_DAYS = 30;
const LLM_USAGE_RETENTION_DAYS = 400;
const RATE_LIMIT_COUNTER_RETENTION_DAYS = 7;
export const PURGE_BATCH_SIZE = 1000;

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Start of the oldest UTC day the tag rollup recomputes: today and the days before it, TAG_STAT_DAYS in all. */
export function tagStatWindowStart(now: Date) {
  return new Date(startOfUtcDay(now).getTime() - (TAG_STAT_DAYS - 1) * MS_PER_DAY);
}

/** Moment before which a Story is past retention. */
export function storyCutoff(now: Date) {
  return new Date(now.getTime() - STORY_RETENTION_DAYS * MS_PER_DAY);
}

/** Moment before which an IngestionRun is past retention. */
export function ingestionRunCutoff(now: Date) {
  return new Date(now.getTime() - INGESTION_RUN_RETENTION_DAYS * MS_PER_DAY);
}

/** UTC day before which an LlmUsage row is past retention. */
export function llmUsageCutoff(now: Date) {
  return new Date(startOfUtcDay(now).getTime() - LLM_USAGE_RETENTION_DAYS * MS_PER_DAY);
}

/** UTC day before which a RateLimitCounter row is past retention. */
export function rateLimitCounterCutoff(now: Date) {
  return new Date(startOfUtcDay(now).getTime() - RATE_LIMIT_COUNTER_RETENTION_DAYS * MS_PER_DAY);
}

export interface TagStatStory {
  publishedAt: Date;
  tags: readonly string[];
  engagementPercentile: number;
  itemEngagements: readonly number[];
}

export interface TagStatRow {
  day: Date;
  tag: string;
  storyCount: number;
  engagementSum: number;
  avgPercentile: number;
}

/** Aggregates Stories into one row per (UTC publish day, tag), from scratch so reruns give the same rows. */
export function aggregateTagStats(stories: readonly TagStatStory[]) {
  const sums = new Map<string, TagStatRow & { percentileSum: number }>();
  for (const story of stories) {
    const day = startOfUtcDay(story.publishedAt);
    const storyEngagement = Math.max(0, ...story.itemEngagements);
    for (const tag of new Set(story.tags)) {
      const key = `${day.toISOString()}|${tag}`;
      const row = sums.get(key) ?? {
        day,
        tag,
        storyCount: 0,
        engagementSum: 0,
        avgPercentile: 0,
        percentileSum: 0,
      };
      row.storyCount += 1;
      row.engagementSum += storyEngagement;
      row.percentileSum += story.engagementPercentile;
      sums.set(key, row);
    }
  }
  return [...sums.values()].map(({ percentileSum, ...row }) => ({
    ...row,
    avgPercentile: percentileSum / row.storyCount,
  }));
}
