import { Injectable } from '@nestjs/common';
import { isTagSlug, tagStory, type StoryCard, type TagSlug } from '@devbrief/shared';
import { WINDOW_DAYS } from '../../common/tag-velocity/tagVelocity.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { FeedService } from '../feed/feed.service.js';
import { MIN_COVERAGE_STORIES, suggestedTags } from './noCoverageBriefing.js';
import type { RetrievedStory } from './retrievedStory.js';

/** PRD §4.3.4: the most stories a briefing is built from. */
export const MAX_RETRIEVED_STORIES = 15;

const DAY_MS = 86_400_000;

export type Retrieval =
  | { kind: 'retrieved'; stories: RetrievedStory[] }
  | { kind: 'no_coverage'; stories: RetrievedStory[]; suggestedTags: TagSlug[] };

/** Maps a feed card to what the prompt and the compiler need; the one place that changes when clusters widen the briefing. */
function toRetrievedStory(card: StoryCard, tldr: string[] | null): RetrievedStory {
  return {
    id: card.id,
    clusterId: card.cluster?.id ?? null,
    title: card.title,
    url: card.url,
    domain: card.domain,
    publishedAt: card.publishedAt,
    tags: card.tags,
    excerpt: card.excerpt,
    // A clustered card shows the combined source line of its members.
    sources: card.cluster?.sources ?? card.sources,
    tldr,
  };
}

/** Finds the recent, ranked stories a question is about (PRD §4.3.4). */
@Injectable()
export class BriefingRetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feed: FeedService,
  ) {}

  /** Finds the stories matching the question's tags or keywords in the feed's 7-day window, or `no_coverage` with tags to suggest. */
  async retrieve(question: string, now = new Date()): Promise<Retrieval> {
    const stories = await this.findStories(question);
    if (stories.length >= MIN_COVERAGE_STORIES) return { kind: 'retrieved', stories };
    return {
      kind: 'no_coverage',
      stories,
      suggestedTags: suggestedTags(questionTags(question), await this.popularTags(now)),
    };
  }

  // The feed's own tag and full-text paths, so retrieval adds no query of its own. The feed's `q` contract caps at 100 characters; this internal call passes the whole question.
  private async findStories(question: string) {
    const tags = questionTags(question);
    const [byTag, byText] = await Promise.all([
      tags.length
        ? this.feed.readFirstPage({ sort: 'top', tags, limit: MAX_RETRIEVED_STORIES })
        : [],
      this.feed.readFirstPage(
        { sort: 'top', q: question, limit: MAX_RETRIEVED_STORIES },
        { ftsMode: 'any' },
      ),
    ]);
    const byId = new Map([...byTag, ...byText].map((card) => [card.id, card]));
    const cards = [...byId.values()]
      .sort((a, b) => b.rankScore - a.rankScore || (a.id < b.id ? 1 : -1))
      .slice(0, MAX_RETRIEVED_STORIES);
    const summaries = await this.prisma.summary.findMany({
      where: { storyId: { in: cards.map((card) => card.id) } },
      select: { storyId: true, tldr: true },
    });
    const tldrById = new Map(summaries.map((summary) => [summary.storyId, summary.tldr]));
    return cards.map((card) => toRetrievedStory(card, tldrById.get(card.id) ?? null));
  }

  private async popularTags(now: Date) {
    // The same 7 UTC days as `TagsService`: today and the six before it.
    const since = new Date(
      Math.floor(now.getTime() / DAY_MS) * DAY_MS - (WINDOW_DAYS['7d'] - 1) * DAY_MS,
    );
    const totals = await this.prisma.tagDailyStat.groupBy({
      by: ['tag'],
      where: { day: { gte: since } },
      _sum: { storyCount: true },
      orderBy: [{ _sum: { storyCount: 'desc' } }, { tag: 'asc' }],
    });
    return totals.map(({ tag }) => tag).filter(isTagSlug);
  }
}

function questionTags(question: string) {
  return tagStory({ title: question, url: '', sourceTags: [], categories: [] });
}
