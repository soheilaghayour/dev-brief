import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { TAXONOMY_VERSION } from '@devbrief/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { IngestionStatus, Source } from '../../generated/prisma/client.js';
import {
  type MappedItem,
  type SourceOutcome,
  describeFailure,
  isCircuitOpen,
  mapRawItem,
  nextSourceHealth,
  nextStoryFields,
  overallStatus,
  reportsSourceFailure,
  storyTags,
  titleDedupWindow,
} from './ingestionRules.js';
import { IngestionLock } from './ingestion.lock.js';
import { IngestionPostRunSteps } from './postRunStep.js';
import { startRunBudget } from './runBudget.js';
import { AdapterRegistry, type CacheValidators, type RawItem } from './sourceAdapter.js';

const RETAG_BATCH_SIZE = 500;

interface Counts {
  fetched: number;
  created: number;
  updated: number;
}

type SourceResult = Counts & { outcome: SourceOutcome };

const NO_COUNTS: Counts = { fetched: 0, created: 0, updated: 0 };

/** Runs one full ingestion: every enabled source, deduplicated into Stories, with a run record per source. */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  // Sources fetch in parallel but write one at a time, so two sources can't create the same Story twice.
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: IngestionLock,
    private readonly adapters: AdapterRegistry,
    private readonly postRunSteps: IngestionPostRunSteps,
  ) {}

  async run(): Promise<{ runId: string; status: IngestionStatus }> {
    const runId = randomUUID();
    const startedAt = new Date();

    const release = await this.lock.tryAcquire();
    if (!release) {
      await this.prisma.ingestionRun.create({
        data: {
          runId,
          status: 'skipped',
          startedAt,
          finishedAt: new Date(),
          durationMs: 0,
          error: 'Another instance holds the ingestion lock',
        },
      });
      return { runId, status: 'skipped' };
    }

    const budget = startRunBudget();
    try {
      const sources = await this.prisma.source.findMany({
        where: { enabled: true },
        orderBy: { slug: 'asc' },
      });
      const settled = await Promise.allSettled(
        sources.map((source) => this.runSource(source, runId, budget.signal)),
      );
      const results = settled.map((result): SourceResult => {
        if (result.status === 'fulfilled') return result.value;
        this.logger.error(`Source run could not be recorded: ${String(result.reason)}`);
        return { ...NO_COUNTS, outcome: 'failed' };
      });

      await this.runPostRunSteps(runId);

      const status = overallStatus(results.map(({ outcome }) => outcome));
      await this.prisma.ingestionRun.create({
        data: {
          runId,
          status,
          startedAt,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          itemsFetched: results.reduce((sum, { fetched }) => sum + fetched, 0),
          itemsCreated: results.reduce((sum, { created }) => sum + created, 0),
          itemsUpdated: results.reduce((sum, { updated }) => sum + updated, 0),
        },
      });
      return { runId, status };
    } finally {
      budget.dispose();
      await release();
    }
  }

  /** True when the last overall run that finished with data (success or partial) is within `maxAgeMinutes`. */
  async hasRecentSuccess(maxAgeMinutes: number, now = new Date()) {
    const latest = await this.prisma.ingestionRun.findFirst({
      where: { sourceId: null, status: { in: ['success', 'partial'] } },
      orderBy: { startedAt: 'desc' },
    });
    return latest !== null && now.getTime() - latest.startedAt.getTime() <= maxAgeMinutes * 60_000;
  }

  /** Re-tags every story that an older taxonomy version tagged. */
  async retagStaleStories() {
    let retagged = 0;
    for (;;) {
      const stories = await this.prisma.story.findMany({
        where: { taggerVersion: { lt: TAXONOMY_VERSION } },
        include: { items: { select: { sourceTags: true } } },
        take: RETAG_BATCH_SIZE,
      });
      if (stories.length === 0) return retagged;
      for (const story of stories) {
        await this.prisma.story.update({
          where: { id: story.id },
          data: storyTags(
            story.title,
            story.canonicalUrl,
            story.items.flatMap(({ sourceTags }) => sourceTags),
          ),
        });
      }
      retagged += stories.length;
    }
  }

  private async runSource(source: Source, runId: string, signal: AbortSignal) {
    const startedAt = new Date();

    if (isCircuitOpen(source, startedAt)) {
      const reason = `Circuit open until ${source.circuitOpenUntil?.toISOString()}`;
      return this.recordSkipped(source, runId, startedAt, reason);
    }
    const adapter = this.adapters.forKind(source.kind);
    if (!adapter) {
      return this.recordSkipped(source, runId, startedAt, `No adapter for ${source.kind}`);
    }

    let fetching = true;
    let validators: CacheValidators | undefined;
    try {
      const rawItems = await adapter.fetch(source, {
        signal,
        rememberValidators: (fresh) => void (validators = fresh),
      });
      fetching = false;
      const counts = await this.serialized(() => this.storeItems(source, rawItems, startedAt));
      await this.prisma.source.update({
        where: { id: source.id },
        data: { ...nextSourceHealth(source, { ok: true }, new Date()), ...validators },
      });
      await this.recordRun(source, runId, startedAt, 'success', counts);
      return { ...counts, outcome: 'success' } satisfies SourceResult;
    } catch (error) {
      const message = describeFailure(error, fetching && signal.aborted);
      this.logger.warn(`Source ${source.slug} failed: ${message}`);
      const health = nextSourceHealth(source, { ok: false, error: message }, new Date());
      await this.prisma.source.update({ where: { id: source.id }, data: health });
      if (reportsSourceFailure(health.consecutiveFailures)) {
        Sentry.captureMessage(
          `Source ${source.slug} failed ${health.consecutiveFailures} times in a row`,
          {
            level: 'error',
            tags: { source: source.slug },
            extra: { lastError: message },
          },
        );
      }
      await this.recordRun(source, runId, startedAt, 'failed', NO_COUNTS, message);
      return { ...NO_COUNTS, outcome: 'failed' } satisfies SourceResult;
    }
  }

  private async recordSkipped(source: Source, runId: string, startedAt: Date, reason: string) {
    await this.recordRun(source, runId, startedAt, 'skipped', NO_COUNTS, reason);
    return { ...NO_COUNTS, outcome: 'skipped' } satisfies SourceResult;
  }

  private recordRun(
    source: Source,
    runId: string,
    startedAt: Date,
    status: IngestionStatus,
    counts: Counts,
    error?: string,
  ) {
    return this.prisma.ingestionRun.create({
      data: {
        runId,
        sourceId: source.id,
        status,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        itemsFetched: counts.fetched,
        itemsCreated: counts.created,
        itemsUpdated: counts.updated,
        error,
      },
    });
  }

  private async runPostRunSteps(runId: string) {
    for (const step of this.postRunSteps.list()) {
      try {
        await step.run({ runId, now: new Date() });
      } catch (error) {
        this.logger.error(`Post-run step ${step.name} failed: ${String(error)}`);
      }
    }
  }

  private serialized<Result>(work: () => Promise<Result>) {
    const result = this.writeQueue.then(work);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  private async storeItems(source: Source, rawItems: RawItem[], now: Date) {
    const counts: Counts = { fetched: rawItems.length, created: 0, updated: 0 };
    let dropped = 0;
    for (const raw of rawItems) {
      let mapped: MappedItem;
      try {
        mapped = mapRawItem(source.kind, raw);
      } catch {
        dropped++;
        continue;
      }
      const result = await this.storeItem(source, raw, mapped, now);
      counts[result]++;
    }
    if (dropped > 0)
      this.logger.warn(`Dropped ${dropped} ${source.slug} items with an invalid URL`);
    return counts;
  }

  private async storeItem(source: Source, raw: RawItem, mapped: MappedItem, now: Date) {
    const itemFields = {
      url: raw.url,
      canonicalUrl: mapped.canonicalUrl,
      discussionUrl: raw.discussionUrl,
      title: raw.title,
      author: raw.author,
      points: raw.points,
      commentsCount: raw.commentsCount,
      reactionsCount: raw.reactionsCount,
      engagement: mapped.engagement,
      sourceTags: raw.sourceTags,
      lastSeenAt: now,
    };
    const existing = await this.prisma.sourceItem.findUnique({
      where: { sourceId_externalId: { sourceId: source.id, externalId: raw.externalId } },
    });
    if (existing) {
      await this.prisma.sourceItem.update({ where: { id: existing.id }, data: itemFields });
      await this.refreshStory(existing.storyId, raw);
      return 'updated';
    }

    const story =
      (await this.findStoryToJoin(mapped, raw)) ??
      (await this.prisma.story.create({
        data: {
          canonicalUrl: mapped.canonicalUrl,
          url: raw.url,
          domain: mapped.domain,
          title: raw.title,
          normalizedTitle: mapped.normalizedTitle,
          excerpt: raw.excerpt,
          author: raw.author,
          publishedAt: raw.publishedAt,
          readingTimeMinutes: raw.readingTimeMinutes,
          ...storyTags(raw.title, mapped.canonicalUrl, raw.sourceTags),
        },
      }));
    await this.prisma.sourceItem.create({
      data: {
        ...itemFields,
        storyId: story.id,
        sourceId: source.id,
        externalId: raw.externalId,
        publishedAt: raw.publishedAt,
        firstSeenAt: now,
      },
    });
    await this.refreshStory(story.id, raw);
    return 'created';
  }

  /** The story whose own or any item's canonical URL matches, else one with the same normalized title published within 72 h. */
  private async findStoryToJoin(mapped: MappedItem, raw: RawItem) {
    const byUrl = await this.findStoryByUrl(mapped.canonicalUrl);
    if (byUrl || mapped.normalizedTitle === '') return byUrl;

    const { from, to } = titleDedupWindow(raw.publishedAt);
    return this.prisma.story.findFirst({
      where: { normalizedTitle: mapped.normalizedTitle, publishedAt: { gte: from, lte: to } },
      orderBy: { publishedAt: 'asc' },
    });
  }

  private async findStoryByUrl(canonicalUrl: string) {
    const byStoryUrl = await this.prisma.story.findUnique({ where: { canonicalUrl } });
    if (byStoryUrl) return byStoryUrl;
    // A story joined by title keeps only its first item's URL; the others live on their items.
    const byItemUrl = await this.prisma.sourceItem.findFirst({
      where: { canonicalUrl },
      orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
      select: { story: true },
    });
    return byItemUrl?.story ?? null;
  }

  /** Recomputes what depends on all of a story's items: tags, earliest publishedAt, missing excerpt and reading time. */
  private async refreshStory(storyId: string, raw: RawItem) {
    const story = await this.prisma.story.findUniqueOrThrow({
      where: { id: storyId },
      include: { items: { select: { sourceTags: true, publishedAt: true } } },
    });
    const fields = nextStoryFields(story, story.items, raw);
    if (fields) await this.prisma.story.update({ where: { id: storyId }, data: fields });
  }
}
