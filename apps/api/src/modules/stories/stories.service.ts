import { Injectable } from '@nestjs/common';
import type { StoryDetail, StoryLookupResponse } from '@devbrief/shared';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  storyWithItems,
  toSourceRef,
  toStoryCard,
} from '../../common/story-card/storyCard.mapper.js';

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async getDetail(id: string): Promise<StoryDetail> {
    const story = await this.prisma.story.findUnique({
      where: { id },
      include: storyWithItems,
    });
    if (!story) throw new ApiException('NOT_FOUND', 'Story not found.');
    return {
      ...toStoryCard(story),
      firstSeenAt: story.firstSeenAt.toISOString(),
      items: story.items.map((item) => ({
        ...toSourceRef(item),
        title: item.title,
        author: item.author,
        publishedAt: item.publishedAt.toISOString(),
      })),
    };
  }

  async lookup(ids: string[]): Promise<StoryLookupResponse> {
    const uniqueIds = [...new Set(ids)];
    const stories = await this.prisma.story.findMany({
      where: { id: { in: uniqueIds } },
      include: storyWithItems,
    });
    const cardsById = new Map(stories.map((story) => [story.id, toStoryCard(story)]));
    return {
      items: uniqueIds.flatMap((id) => cardsById.get(id) ?? []),
      missingIds: uniqueIds.filter((id) => !cardsById.has(id)),
    };
  }
}
