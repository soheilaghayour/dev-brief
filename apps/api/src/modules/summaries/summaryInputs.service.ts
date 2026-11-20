import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import {
  DEVTO_API,
  DEVTO_REQUEST_GAP_MS,
  DEVTO_REQUEST_OPTIONS,
} from '../../common/devto/devtoApi.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { HttpClient } from '../../common/http/httpClient.js';
import { mapWithConcurrency } from '../../common/http/mapWithConcurrency.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { CommentNode } from './flattenComments.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import { parseAlgoliaThread, parseDevtoArticleText, parseDevtoThread } from './upstreamPayloads.js';

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

/** Loads a story with its own items' comments and text; the one place clustering widens to all cluster members. */
@Injectable()
export class SummaryInputsService {
  // Dev.to requests from every summary share one serial queue, at least the gap apart.
  private devtoQueue: Promise<unknown> = Promise.resolve();
  private lastDevtoRequestAt = -Infinity;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpClient,
    private readonly pause: (ms: number) => Promise<unknown> = (ms) => sleep(ms),
    private readonly nowMs: () => number = Date.now,
  ) {}

  /** Throws `NOT_FOUND` for an unknown story and `SummaryInputsUnavailableError` when any fetch fails. */
  async collectSummaryInputs(storyId: string): Promise<SummaryInputs> {
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
    try {
      const [hnThreads, devtoThreads, articleText] = await Promise.all([
        mapWithConcurrency(hnItems, ALGOLIA_CONCURRENCY, (item) => this.fetchHnThread(item)),
        Promise.all(devtoItems.map((item) => this.fetchDevtoThread(item))),
        devtoItems[0] ? this.fetchDevtoArticleText(devtoItems[0]) : null,
      ]);
      return {
        storyId,
        title: story.title,
        text: articleText || story.excerpt,
        threads: [...hnThreads, ...devtoThreads],
      };
    } catch (error) {
      throw new SummaryInputsUnavailableError(storyId, { cause: error });
    }
  }

  private async fetchHnThread(item: InputItem) {
    const payload = await this.http.getJson(
      `${ALGOLIA_ITEMS}/${item.externalId}`,
      ALGOLIA_REQUEST_OPTIONS,
    );
    return parseAlgoliaThread(payload);
  }

  private async fetchDevtoThread(item: InputItem) {
    const id = encodeURIComponent(item.externalId);
    return parseDevtoThread(await this.devtoRequest(`/comments?a_id=${id}`));
  }

  private async fetchDevtoArticleText(item: InputItem) {
    const id = encodeURIComponent(item.externalId);
    return parseDevtoArticleText(await this.devtoRequest(`/articles/${id}`));
  }

  private devtoRequest(path: string) {
    const request = this.devtoQueue.then(async () => {
      const waitMs = this.lastDevtoRequestAt + DEVTO_REQUEST_GAP_MS - this.nowMs();
      if (waitMs > 0) await this.pause(waitMs);
      try {
        return await this.http.getJson(`${DEVTO_API}${path}`, DEVTO_REQUEST_OPTIONS);
      } finally {
        this.lastDevtoRequestAt = this.nowMs();
      }
    });
    this.devtoQueue = request.catch(() => undefined);
    return request;
  }
}
