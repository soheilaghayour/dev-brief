import { Inject, Injectable } from '@nestjs/common';
import type { StoryDetail, StoryLookupResponse } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
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
      // The detail shows the summary itself; cards only say whether there is one.
      include: { ...storyWithItems, summary: true },
    });
    if (!story) throw new ApiException('NOT_FOUND', 'Story not found.');
    return {
      ...toStoryCard(story, this.features),
      firstSeenAt: story.firstSeenAt.toISOString(),
      items: story.items.map((item) => ({
        ...toSourceRef(item),
        title: item.title,
        author: item.author,
        publishedAt: item.publishedAt.toISOString(),
      })),
      ...(this.features.summaries && {
        summary: story.summary && toStorySummary(story.summary),
      }),
    };
  }

  async lookup(ids: string[]): Promise<StoryLookupResponse> {
    const uniqueIds = [...new Set(ids)];
    const stories = await this.prisma.story.findMany({
      where: { id: { in: uniqueIds } },
      include: storyWithItems,
    });
    const cardsById = new Map(
      stories.map((story) => [story.id, toStoryCard(story, this.features)]),
    );
    return {
      items: uniqueIds.flatMap((id) => cardsById.get(id) ?? []),
      missingIds: uniqueIds.filter((id) => !cardsById.has(id)),
    };
  }
}
