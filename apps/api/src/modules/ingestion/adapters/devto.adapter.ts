import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  DEVTO_API,
  DEVTO_REQUEST_GAP_MS,
  DEVTO_REQUEST_OPTIONS,
} from '../../../common/devto/devtoApi.js';
import { HttpClient } from '../../../common/http/httpClient.js';
import type { Source } from '../../../generated/prisma/client.js';
import type { FetchContext, RawItem, SourceAdapter } from '../sourceAdapter.js';
import { EXCERPT_MAX_LENGTH, toPlainText } from '../../../common/text/plainText.js';

const LIST_PATHS = ['/articles?top=1&per_page=50', '/articles/latest?per_page=50'];

const DevtoArticleSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  description: z.string().nullish(),
  url: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//.test(value)),
  canonical_url: z.string().min(1).nullish().catch(null),
  published_at: z.string().datetime({ offset: true }),
  comments_count: z.number().int(),
  public_reactions_count: z.number().int(),
  reading_time_minutes: z.number().int().nullish(),
  tag_list: z.array(z.string()),
  user: z
    .object({ name: z.string().min(1) })
    .nullish()
    .catch(null),
});
type DevtoArticle = z.infer<typeof DevtoArticleSchema>;

function toRawItem(article: DevtoArticle): RawItem {
  return {
    externalId: String(article.id),
    // The canonical URL is the article's identity: a cross-post then joins the original blog's Story.
    url: article.canonical_url ?? article.url,
    discussionUrl: article.url,
    title: article.title,
    author: article.user?.name ?? null,
    publishedAt: new Date(article.published_at),
    points: null,
    commentsCount: article.comments_count,
    reactionsCount: article.public_reactions_count,
    stars: null,
    sourceTags: article.tag_list,
    excerpt: article.description ? toPlainText(article.description, EXCERPT_MAX_LENGTH) : null,
    readingTimeMinutes: article.reading_time_minutes ?? null,
  };
}

/** Reads the top and the latest Dev.to articles, two serial requests, deduplicated by article id. */
@Injectable()
export class DevtoAdapter implements SourceAdapter {
  readonly kind = 'devto';
  private readonly logger = new Logger(DevtoAdapter.name);

  constructor(
    private readonly http: HttpClient,
    private readonly pause: (ms: number, signal: AbortSignal) => Promise<unknown> = (ms, signal) =>
      sleep(ms, undefined, { signal }),
  ) {}

  async fetch(_source: Source, { signal }: FetchContext): Promise<RawItem[]> {
    const articlesById = new Map<number, DevtoArticle>();
    let invalid = 0;

    for (const [index, path] of LIST_PATHS.entries()) {
      if (index > 0) await this.pause(DEVTO_REQUEST_GAP_MS, signal);
      const payload = await this.http.getJson(`${DEVTO_API}${path}`, {
        ...DEVTO_REQUEST_OPTIONS,
        signal,
      });
      for (const article of z.array(z.unknown()).parse(payload)) {
        const parsed = DevtoArticleSchema.safeParse(article);
        if (!parsed.success) invalid++;
        else if (!articlesById.has(parsed.data.id)) articlesById.set(parsed.data.id, parsed.data);
      }
    }

    if (invalid > 0) this.logger.warn(`Dropped ${invalid} invalid Dev.to articles`);
    return [...articlesById.values()].map(toRawItem);
  }
}
