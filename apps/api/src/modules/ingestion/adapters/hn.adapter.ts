import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { HttpClient, type HttpRequestOptions } from '../../../common/http/httpClient.js';
import type { Source } from '../../../generated/prisma/client.js';
import type { RawItem, SourceAdapter } from '../sourceAdapter.js';

const HN_API = 'https://hacker-news.firebaseio.com/v0';
const HN_ITEM_PAGE = 'https://news.ycombinator.com/item?id=';
const TOP_STORIES_LIMIT = 100;
const ITEM_CONCURRENCY = 10;
const MAX_FAILED_ITEM_SHARE = 0.3;
const SOURCE_BUDGET_MS = 60_000;
const REQUEST_OPTIONS = { timeoutMs: 5000, retryBackoffMs: [500, 1500] };

const TopStoriesSchema = z.array(z.number().int());

const HnItemSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  by: z.string().optional(),
  time: z.number().int().optional(),
  title: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  score: z.number().int().optional(),
  descendants: z.number().int().optional(),
  dead: z.boolean().optional(),
  deleted: z.boolean().optional(),
});
type HnItem = z.infer<typeof HnItemSchema>;

type ItemResult = { kind: 'story'; item: RawItem } | { kind: 'skipped' } | { kind: 'failed' };

function toRawItem(item: HnItem & { title: string; time: number }): RawItem {
  const discussionUrl = `${HN_ITEM_PAGE}${item.id}`;
  return {
    externalId: String(item.id),
    // Ask HN and some Show HN posts have no url: they link to their own HN page.
    url: item.url ?? discussionUrl,
    discussionUrl,
    title: item.title,
    author: item.by ?? null,
    publishedAt: new Date(item.time * 1000),
    points: item.score ?? 0,
    commentsCount: item.descendants ?? 0,
    reactionsCount: null,
    stars: null,
    sourceTags: [],
    excerpt: null,
    readingTimeMinutes: null,
  };
}

async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  work: (input: Input) => Promise<Output>,
) {
  const outputs: Output[] = [];
  let next = 0;
  const worker = async () => {
    while (next < inputs.length) {
      const index = next++;
      outputs[index] = await work(inputs[index] as Input);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return outputs;
}

/** Reads the HN front page from the Firebase API: `topstories`, then one `item` call per id. */
@Injectable()
export class HnAdapter implements SourceAdapter {
  readonly kind = 'hn';
  private readonly logger = new Logger(HnAdapter.name);

  constructor(private readonly http: HttpClient) {}

  async fetch(_source: Source, { signal }: { signal: AbortSignal }): Promise<RawItem[]> {
    const sourceSignal = AbortSignal.any([signal, AbortSignal.timeout(SOURCE_BUDGET_MS)]);
    const request = { ...REQUEST_OPTIONS, signal: sourceSignal };

    const topStories = TopStoriesSchema.parse(
      await this.http.getJson(`${HN_API}/topstories.json`, request),
    );
    const ids = topStories.slice(0, TOP_STORIES_LIMIT);

    const results = await mapWithConcurrency(ids, ITEM_CONCURRENCY, (id) =>
      this.fetchItem(id, request),
    );

    const failed = results.filter((result) => result.kind === 'failed');
    if (failed.length > ids.length * MAX_FAILED_ITEM_SHARE) {
      throw new Error(`${failed.length} of ${ids.length} HN items failed`);
    }
    if (failed.length > 0) {
      this.logger.warn(`Skipped ${failed.length} HN items that failed or were invalid`);
    }
    return results.flatMap((result) => (result.kind === 'story' ? [result.item] : []));
  }

  private async fetchItem(id: number, request: HttpRequestOptions): Promise<ItemResult> {
    let payload: unknown;
    try {
      payload = await this.http.getJson(`${HN_API}/item/${id}.json`, request);
    } catch {
      return { kind: 'failed' };
    }
    // Firebase answers `null` for a removed item.
    if (payload === null) return { kind: 'skipped' };

    const parsed = HnItemSchema.safeParse(payload);
    if (!parsed.success) return { kind: 'failed' };
    const item = parsed.data;
    if (item.type !== 'story' || item.dead || item.deleted) return { kind: 'skipped' };
    if (item.title === undefined || item.time === undefined) return { kind: 'failed' };
    return { kind: 'story', item: toRawItem({ ...item, title: item.title, time: item.time }) };
  }
}
