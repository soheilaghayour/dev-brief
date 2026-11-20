import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import { z } from 'zod';
import type { RawItem } from '../sourceAdapter.js';
import { EXCERPT_MAX_LENGTH, toPlainText } from '../../../common/text/plainText.js';

export const MAX_ITEMS_PER_FEED = 20;
export const MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// RSS gives "text" or { _: "text", $: { domain } }; Atom gives { $: { term } }.
const CategorySchema = z.union([
  z.string(),
  z.object({ _: z.string() }).transform((category) => category._),
  z.object({ $: z.object({ term: z.string() }) }).transform((category) => category.$.term),
]);

// Only title and link decide whether an item exists; a malformed optional field must not cost the item.
const FeedItemSchema = z.object({
  title: z.string().optional(),
  link: z.string().optional(),
  guid: z.string().optional().catch(undefined),
  id: z.string().optional().catch(undefined),
  isoDate: z.string().optional().catch(undefined),
  pubDate: z.string().optional().catch(undefined),
  content: z.string().optional().catch(undefined),
  summary: z.string().optional().catch(undefined),
  creator: z.string().optional().catch(undefined),
  author: z.string().optional().catch(undefined),
  rawCategories: z.array(CategorySchema.catch('')).catch([]),
});

interface AtomEntryParser {
  parseItemAtom(entry: Record<string, unknown>): unknown;
}

function createFeedParser() {
  const parser = new Parser({
    customFields: { item: [['category', 'rawCategories', { keepArray: true }]] },
  });
  const atom = parser as unknown as AtomEntryParser;
  const parseEntry = atom.parseItemAtom.bind(parser);
  // rss-parser formats an Atom <published>/<updated> with an unguarded toISOString(), so one bad date would fail the whole feed.
  atom.parseItemAtom = (entry) => {
    try {
      return parseEntry(entry);
    } catch {
      return parseEntry({ ...entry, published: undefined, updated: undefined });
    }
  };
  return parser;
}

export interface ParsedFeed {
  items: RawItem[];
  /** Items dropped for a missing or unparseable date. */
  skippedWithoutDate: number;
  /** Items dropped for a missing title or a missing or unusable link. */
  invalid: number;
}

function sha1(text: string) {
  return createHash('sha1').update(text).digest('hex');
}

function parseDate(item: z.infer<typeof FeedItemSchema>) {
  const date = new Date(item.isoDate ?? item.pubDate ?? '');
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Resolves a possibly relative link against the feed URL; undefined when it is not an http(s) URL. */
function resolveLink(link: string | undefined, baseUrl: string) {
  if (!link?.trim()) return undefined;
  try {
    const url = new URL(link.trim(), baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function toRawItem(
  item: z.infer<typeof FeedItemSchema>,
  link: string,
  publishedAt: Date,
  title: string,
): RawItem {
  const body = item.content ?? item.summary;
  return {
    // Atom's <id> is its guid.
    externalId: sha1(item.guid?.trim() || item.id?.trim() || link),
    url: link,
    discussionUrl: null,
    title,
    author: item.creator ?? item.author ?? null,
    publishedAt,
    points: null,
    commentsCount: null,
    reactionsCount: null,
    stars: null,
    sourceTags: item.rawCategories.map((tag) => tag.trim()).filter(Boolean),
    excerpt: body ? toPlainText(body, EXCERPT_MAX_LENGTH) || null : null,
    readingTimeMinutes: null,
  };
}

/**
 * Parses an RSS or Atom document into the newest items of the last 7 days.
 * Throws when the document is not well-formed XML, so the feed counts as failed.
 */
export async function parseFeed(
  xml: string,
  { baseUrl, now }: { baseUrl: string; now: Date },
): Promise<ParsedFeed> {
  const feed = await createFeedParser().parseString(xml);
  const oldest = now.getTime() - MAX_ITEM_AGE_MS;
  const recent: RawItem[] = [];
  let skippedWithoutDate = 0;
  let invalid = 0;

  for (const entry of feed.items) {
    const parsed = FeedItemSchema.safeParse(entry);
    if (!parsed.success) {
      invalid++;
      continue;
    }
    const item = parsed.data;
    const parsedAt = parseDate(item);
    if (!parsedAt) {
      skippedWithoutDate++;
      continue;
    }
    // Feed dates are author-written: a future one would keep the item at maximum freshness.
    const publishedAt = parsedAt > now ? now : parsedAt;
    const link = resolveLink(item.link, baseUrl);
    const title = item.title ? toPlainText(item.title) : '';
    if (!link || !title) {
      invalid++;
      continue;
    }
    if (publishedAt.getTime() >= oldest) recent.push(toRawItem(item, link, publishedAt, title));
  }

  recent.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return { items: recent.slice(0, MAX_ITEMS_PER_FEED), skippedWithoutDate, invalid };
}
