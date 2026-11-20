import { Injectable, Logger } from '@nestjs/common';
import { createLimiter } from '../../../common/http/createLimiter.js';
import { HttpClient } from '../../../common/http/httpClient.js';
import type { Source } from '../../../generated/prisma/client.js';
import type { FetchContext, RawItem, SourceAdapter } from '../sourceAdapter.js';
import { parseFeed } from './rssFeed.js';

const FEED_CONCURRENCY = 4;
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const REQUEST_OPTIONS = {
  timeoutMs: 10_000,
  retryBackoffMs: [1000],
  maxResponseBytes: MAX_FEED_BYTES,
};
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8';

/** Reads one RSS or Atom feed per Source with a conditional GET; a 304 is a success with no items. */
@Injectable()
export class RssAdapter implements SourceAdapter {
  readonly kind = 'rss';
  private readonly logger = new Logger(RssAdapter.name);
  // The engine runs every feed's Source at once; this keeps at most 4 requests in flight.
  private readonly limitConcurrency = createLimiter(FEED_CONCURRENCY);

  constructor(
    private readonly http: HttpClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  fetch(source: Source, context: FetchContext): Promise<RawItem[]> {
    return this.limitConcurrency(() => this.fetchFeed(source, context));
  }

  private async fetchFeed(source: Source, { signal, rememberValidators }: FetchContext) {
    if (!source.feedUrl) throw new Error(`Source ${source.slug} has no feedUrl`);

    const headers: Record<string, string> = { Accept: ACCEPT };
    if (source.etag) headers['If-None-Match'] = source.etag;
    if (source.lastModified) headers['If-Modified-Since'] = source.lastModified;
    const response = await this.http.get(source.feedUrl, { ...REQUEST_OPTIONS, headers, signal });
    if (response.status === 304) return [];

    const feed = await parseFeed(response.text, { baseUrl: source.feedUrl, now: this.now() });
    if (feed.skippedWithoutDate > 0 || feed.invalid > 0) {
      this.logger.warn(
        `Feed ${source.slug}: skipped ${feed.skippedWithoutDate} items without a parseable date, dropped ${feed.invalid} invalid items`,
      );
    }
    rememberValidators?.({
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    });
    return feed.items;
  }
}
