import { Inject, Injectable } from '@nestjs/common';
import type { ClusterDetail } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { newestSummary } from '../../common/story-card/clusterSummary.js';
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
          include: { ...storyWithItems, summary: true },
          orderBy: [{ rankScore: 'desc' }, { id: 'desc' }],
        },
      },
    });
    const representative = cluster?.stories.find(
      (story) => story.id === cluster.representativeStoryId,
    );
    if (!cluster || !representative) throw new ApiException('NOT_FOUND', 'Cluster not found.');
    const summary = newestSummary(cluster.stories.flatMap((story) => story.summary ?? []));
    const summarized = new Set(summary ? [cluster.id] : []);
    return {
      id: cluster.id,
      representative: toStoryCard(representative, this.features, undefined, summarized),
      members: cluster.stories
        .filter((story) => story.id !== representative.id)
        .map((story) => toStoryCard(story, this.features, undefined, summarized)),
      sourceKinds: cluster.sourceKinds,
      summary: this.features.summaries && summary ? toStorySummary(summary) : null,
    };
  }
}
