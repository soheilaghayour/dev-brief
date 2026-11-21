import { Inject, Injectable, Logger } from '@nestjs/common';
import { DevtoClient } from '../../common/devto/devtoClient.js';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { createLimiter } from '../../common/http/createLimiter.js';
import { HttpClient } from '../../common/http/httpClient.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SUMMARY_MIN_COMMENTS } from '../../common/summary-input/hasSummaryInput.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type CommentNode, countComments } from './flattenComments.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import { inputFailureScope } from './summaryRules.js';
import {
  type ParsedThread,
  parseAlgoliaThread,
  parseDevtoArticleText,
  parseDevtoThread,
} from './upstreamPayloads.js';

const ALGOLIA_ITEMS = 'https://hn.algolia.com/api/v1/items';
// PRD §8.3. A busy thread runs to several MB.
const ALGOLIA_REQUEST_OPTIONS = {
  timeoutMs: 8000,
  retryBackoffMs: [500, 1500],
  maxResponseBytes: 10 * 1024 * 1024,
};
const ALGOLIA_CONCURRENCY = 4;

/** What one summary is built from, before the prompt trims it to its budget. */
export type SummaryInputs = {
  /** The story summarised: the representative's id for a clustered story. */
  storyId: string;
  title: string;
  /** The Dev.to article body or the excerpt, as plain text; null when no member has either. */
  text: string | null;
  /** One comment tree per source item, of every cluster member. */
  threads: CommentNode[][];
};

type InputItem = { externalId: string; source: { kind: string } };
type InputStory = { id: string; title: string; excerpt: string | null; items: InputItem[] };

const ITEMS_SELECT = {
  select: { externalId: true, source: { select: { kind: true } } },
  orderBy: [{ engagement: 'desc' }, { id: 'asc' }],
} satisfies Prisma.Story$itemsArgs;

/** Loads a story's comments and text; with clusters on, those of every member of its cluster. */
@Injectable()
export class SummaryInputsService {
  private readonly logger = new Logger(SummaryInputsService.name);
  // PRD §8.3 limits Algolia per client, so the limit spans every summary in flight, auto and on-demand.
  private readonly algoliaSlot = createLimiter(ALGOLIA_CONCURRENCY);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpClient,
    private readonly devto: DevtoClient,
    @Inject(ENV) private readonly env: Pick<Env, 'FEATURE_CLUSTERS'>,
  ) {}

  /** Throws `NOT_FOUND` for an unknown story or one with no text and fewer than `SUMMARY_MIN_COMMENTS` comments once fetched, and `SummaryInputsUnavailableError` when any fetch fails or `signal` aborts. */
  async collectSummaryInputs(
    storyId: string,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<SummaryInputs> {
    // The representative first, then the other members by rank: it decides the title and the text, and the order of the threads.
    const [representative, ...others] = await this.loadMembers(storyId);
    const members = [representative, ...others];
    const items = members.flatMap((member) => member.items);
    const hnItems = items.filter((item) => item.source.kind === 'hn');
    const devtoItems = items.filter((item) => item.source.kind === 'devto');
    // One article call, whatever the cluster size: the representative's Dev.to item, else the first member's (HN stories have no excerpt).
    const articleItem = items.find((item) => item.source.kind === 'devto');
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
        articleItem ? failFast(this.fetchDevtoArticleText(articleItem, fetchSignal)) : null,
      ]);
      const threads = [...hnThreads, ...devtoThreads];
      this.logDropped(representative.id, threads);
      // The article's text; without one, the first excerpt in member order.
      const text = articleText || members.find((member) => member.excerpt)?.excerpt || null;
      const comments = threads.map((thread) => thread.comments);
      // A Dev.to article whose body is only an embed passes `hasSummaryInput` on stored data, but the model would invent a summary from the title alone.
      if (!text && countComments(comments) < SUMMARY_MIN_COMMENTS) {
        throw new ApiException('NOT_FOUND', 'This story has too little discussion to summarise.');
      }
      return { storyId: representative.id, title: representative.title, text, threads: comments };
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw new SummaryInputsUnavailableError(representative.id, inputFailureScope(error), {
        cause: error,
      });
    }
  }

  /** The story's cluster members, representative first and the rest by rankScore, or the story alone; throws `NOT_FOUND`. */
  private async loadMembers(storyId: string): Promise<[InputStory, ...InputStory[]]> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: { items: ITEMS_SELECT },
    });
    if (!story) throw new ApiException('NOT_FOUND', 'Story not found.');
    if (!this.env.FEATURE_CLUSTERS || !story.clusterId) return [story];
    const cluster = await this.prisma.cluster.findUnique({
      where: { id: story.clusterId },
      select: {
        representativeStoryId: true,
        stories: {
          select: { id: true, title: true, excerpt: true, items: ITEMS_SELECT },
          orderBy: [{ rankScore: 'desc' }, { id: 'desc' }],
        },
      },
    });
    const representative = cluster?.stories.find(
      (member) => member.id === cluster.representativeStoryId,
    );
    if (!cluster || !representative) return [story];
    return [representative, ...cluster.stories.filter((member) => member !== representative)];
  }

  private fetchHnThread(item: InputItem, signal: AbortSignal) {
    return this.algoliaSlot(async () => {
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
