import { Inject, Injectable } from '@nestjs/common';
import type { ClusterDetail } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { findSummary } from '../../common/story-card/clusterSummary.js';
import { hasSummaryInput } from '../../common/summary-input/hasSummaryInput.js';
import {
  type StoryFeatures,
  storyFeatures,
  storyWithItems,
  toStoryCard,
  toStorySummary,
} from '../../common/story-card/storyCard.mapper.js';

@Injectable()
export class ClustersService {
  private readonly features: StoryFeatures;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.features = storyFeatures(env);
  }

  async getDetail(id: string): Promise<ClusterDetail> {
    const cluster = await this.prisma.cluster.findUnique({
      where: { id },
      include: {
        stories: {
          include: storyWithItems,
          orderBy: [{ rankScore: 'desc' }, { id: 'desc' }],
        },
      },
    });
    const representative = cluster?.stories.find(
      (story) => story.id === cluster.representativeStoryId,
    );
    if (!cluster || !representative) throw new ApiException('NOT_FOUND', 'Cluster not found.');
    const summary = this.features.summaries
      ? await findSummary(this.prisma, representative, true)
      : null;
    const summaries = new Map([
      [
        cluster.id,
        {
          line: summary?.tldr[0] ?? null,
          canSummarize: hasSummaryInput({ items: cluster.stories.flatMap((story) => story.items) }),
        },
      ],
    ]);
    return {
      id: cluster.id,
      representative: toStoryCard(representative, this.features, undefined, summaries),
      members: cluster.stories
        .filter((story) => story.id !== representative.id)
        .map((story) => toStoryCard(story, this.features, undefined, summaries)),
      sourceKinds: cluster.sourceKinds,
      summary: summary && toStorySummary(summary),
    };
  }
}
