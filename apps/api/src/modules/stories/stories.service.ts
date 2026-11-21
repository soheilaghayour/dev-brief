import { Inject, Injectable } from '@nestjs/common';
import type { StoryDetail, StoryLookupResponse } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { toStoryCards } from '../../common/story-card/clusterCards.js';
import {
  findSummary,
  loadSummaryInputItems,
  type ClusterSummaryInfo,
} from '../../common/story-card/clusterSummary.js';
import { hasSummaryInput } from '../../common/summary-input/hasSummaryInput.js';
import {
  type StoryFeatures,
  storyFeatures,
  storyWithItems,
  toSourceRef,
  toStoryCard,
  toStorySummary,
} from '../../common/story-card/storyCard.mapper.js';

@Injectable()
export class StoriesService {
  private readonly features: StoryFeatures;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.features = storyFeatures(env);
  }

  async getDetail(id: string): Promise<StoryDetail> {
    const story = await this.prisma.story.findUnique({
      where: { id },
      // The detail shows the summary itself; cards carry only its first point.
      include: { ...storyWithItems, summary: true },
    });
    if (!story) throw new ApiException('NOT_FOUND', 'Story not found.');
    const { clusterId } = story;
    // The cluster's summary on any member's page; a single story's own otherwise.
    const clusterSummarised = this.features.summaries && this.features.clusters && clusterId;
    const summary = clusterSummarised ? await findSummary(this.prisma, story, true) : story.summary;
    // The one answer for the cluster serves the detail's card and its members' cards; a single story's card reads its own row.
    const summaries = clusterSummarised
      ? new Map([
          [
            clusterId,
            {
              line: summary?.tldr[0] ?? null,
              canSummarize: hasSummaryInput({
                items: await loadSummaryInputItems(this.prisma, story, true),
              }),
            },
          ],
        ])
      : undefined;
    const [card] = await toStoryCards(this.prisma, [story], this.features, summaries);
    const clusterMembers =
      this.features.clusters && clusterId ? await this.otherMembers(clusterId, id, summaries) : [];
    return {
      ...card!,
      firstSeenAt: story.firstSeenAt.toISOString(),
      items: story.items.map((item) => ({
        ...toSourceRef(item),
        title: item.title,
        author: item.author,
        publishedAt: item.publishedAt.toISOString(),
      })),
      ...(clusterMembers.length > 0 && { clusterMembers }),
      ...(this.features.summaries && { summary: summary && toStorySummary(summary) }),
    };
  }

  private async otherMembers(
    clusterId: string,
    storyId: string,
    summaries: ReadonlyMap<string, ClusterSummaryInfo> | undefined,
  ) {
    const members = await this.prisma.story.findMany({
      where: { clusterId, id: { not: storyId } },
      include: storyWithItems,
      orderBy: [{ rankScore: 'desc' }, { id: 'desc' }],
    });
    return members.map((member) => toStoryCard(member, this.features, undefined, summaries));
  }

  async lookup(ids: string[]): Promise<StoryLookupResponse> {
    const uniqueIds = [...new Set(ids)];
    const stories = await this.prisma.story.findMany({
      where: { id: { in: uniqueIds } },
      include: storyWithItems,
    });
    const cards = await toStoryCards(this.prisma, stories, this.features);
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    return {
      items: uniqueIds.flatMap((id) => cardsById.get(id) ?? []),
      missingIds: uniqueIds.filter((id) => !cardsById.has(id)),
    };
  }
}
