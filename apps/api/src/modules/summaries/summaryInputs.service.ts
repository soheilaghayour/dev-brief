import { Injectable, Logger } from '@nestjs/common';
import { DevtoClient } from '../../common/devto/devtoClient.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { HttpClient } from '../../common/http/httpClient.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { CommentNode } from './flattenComments.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import { inputFailureScope } from './summaryRules.js';
import {
  type ParsedThread,
  parseAlgoliaThread,
  parseDevtoArticleText,
  parseDevtoThread,
} from './upstreamPayloads.js';

const ALGOLIA_ITEMS = 'https://hn.algolia.com/api/v1/items';
// PRD §8.3. The most-discussed threads, the ones auto summaries pick, run to several MB.
const ALGOLIA_REQUEST_OPTIONS = {
  timeoutMs: 8000,
  retryBackoffMs: [500, 1500],
  maxResponseBytes: 10 * 1024 * 1024,
};
const ALGOLIA_CONCURRENCY = 4;

/** What one summary is built from, before the prompt trims it to its budget. */
export type SummaryInputs = {
  storyId: string;
  title: string;
  /** The Dev.to article body or the story's excerpt, as plain text; null when the story has neither. */
  text: string | null;
  /** One comment tree per source item. */
  threads: CommentNode[][];
};

type InputItem = { externalId: string; source: { kind: string } };

/** Runs tasks with at most `limit` in flight across every caller; the others wait in arrival order. */
function concurrencyLimit(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <Result>(task: () => Promise<Result>) => {
    if (active < limit) active += 1;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      // A waiting task takes over this slot; with none waiting, the slot is freed.
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

/** Loads a story with its own items' comments and text; the one place clustering widens to all cluster members. */
@Injectable()
export class SummaryInputsService {
  private readonly logger = new Logger(SummaryInputsService.name);
  // PRD §8.3 limits Algolia per client, so the limit spans every summary in flight, auto and on-demand.
  private readonly algoliaSlot = concurrencyLimit(ALGOLIA_CONCURRENCY);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpClient,
    private readonly devto: DevtoClient,
  ) {}

  /** Throws `NOT_FOUND` for an unknown story and `SummaryInputsUnavailableError` when any fetch fails or `signal` aborts. */
  async collectSummaryInputs(
    storyId: string,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<SummaryInputs> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: {
        items: {
          select: { externalId: true, source: { select: { kind: true } } },
          orderBy: [{ engagement: 'desc' }, { id: 'asc' }],
        },
      },
    });
    if (!story) throw new ApiException('NOT_FOUND', 'Story not found.');

    const hnItems = story.items.filter((item) => item.source.kind === 'hn');
    const devtoItems = story.items.filter((item) => item.source.kind === 'devto');
    // The first failed fetch cancels the story's others, queued Dev.to requests included: the summary is off either way.
    const storyFetches = new AbortController();
    const fetchSignal = signal
      ? AbortSignal.any([signal, storyFetches.signal])
      : storyFetches.signal;
    const failFast = <Result>(fetching: Promise<Result>) =>
      fetching.catch((error: unknown) => {
        storyFetches.abort(error);
        throw error;
      });
    try {
      const [hnThreads, devtoThreads, articleText] = await Promise.all([
        Promise.all(hnItems.map((item) => failFast(this.fetchHnThread(item, fetchSignal)))),
        Promise.all(devtoItems.map((item) => failFast(this.fetchDevtoThread(item, fetchSignal)))),
        devtoItems[0] ? failFast(this.fetchDevtoArticleText(devtoItems[0], fetchSignal)) : null,
      ]);
      const threads = [...hnThreads, ...devtoThreads];
      this.logDropped(storyId, threads);
      return {
        storyId,
        title: story.title,
        text: articleText || story.excerpt,
        threads: threads.map(({ comments }) => comments),
      };
    } catch (error) {
      throw new SummaryInputsUnavailableError(storyId, inputFailureScope(error), { cause: error });
    }
  }

  private fetchHnThread(item: InputItem, signal: AbortSignal) {
    return this.algoliaSlot(async () => {
      // A request that waited for its slot is not sent once its story gave up.
      signal.throwIfAborted();
      const payload = await this.http.getJson(`${ALGOLIA_ITEMS}/${item.externalId}`, {
        ...ALGOLIA_REQUEST_OPTIONS,
        signal,
      });
      return parseAlgoliaThread(payload);
    });
  }

  private async fetchDevtoThread(item: InputItem, signal: AbortSignal) {
    const id = encodeURIComponent(item.externalId);
    return parseDevtoThread(await this.devto.getJson(`/comments?a_id=${id}`, signal));
  }

  private async fetchDevtoArticleText(item: InputItem, signal: AbortSignal) {
    const id = encodeURIComponent(item.externalId);
    return parseDevtoArticleText(await this.devto.getJson(`/articles/${id}`, signal));
  }

  private logDropped(storyId: string, threads: readonly ParsedThread[]) {
    const dropped = threads.reduce((sum, thread) => sum + thread.dropped, 0);
    if (dropped > 0) this.logger.warn(`Dropped ${dropped} malformed comments of story ${storyId}`);
  }
}
