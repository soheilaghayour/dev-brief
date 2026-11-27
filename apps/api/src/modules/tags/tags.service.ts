import { Inject, Injectable } from '@nestjs/common';
import { TAXONOMY, TAXONOMY_VERSION, type TagList, type TagListQuery } from '@devbrief/shared';
import { CACHE_TTL_MS, LruCache } from '../../common/cache/lru.cache.js';
import { ENV, type Env } from '../../common/env/env.module.js';
import { buildFeedFilters, whereClause } from '../../common/feed-filters/feedFilters.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { storyFeatures } from '../../common/story-card/storyCard.mapper.js';
import { tagCountsCacheKey } from './tagCountsKey.js';

@Injectable()
export class TagsService {
  private readonly clusters: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LruCache,
    @Inject(ENV) env: Env,
  ) {
    this.clusters = storyFeatures(env).clusters;
  }

  /** Every taxonomy tag with the number of stories the feed lists for it as the only selected tag. */
  async list(query: TagListQuery): Promise<TagList> {
    const cacheKey = tagCountsCacheKey(query);
    const cached = this.cache.get<TagList>(cacheKey);
    if (cached) return cached;

    const countByTag = await this.countByTag(query);
    const list: TagList = {
      version: TAXONOMY_VERSION,
      tags: TAXONOMY.map(({ slug, label }) => ({ slug, label, count: countByTag.get(slug) ?? 0 })),
    };
    this.cache.set(cacheKey, list, CACHE_TTL_MS);
    return list;
  }

  /** One grouped read over the stories the feed lists without its tag filter: the feed's own filters, so the counts match the list. */
  private async countByTag(query: TagListQuery) {
    const filters = await buildFeedFilters(this.prisma, query, {
      clusters: this.clusters,
      now: new Date(),
    });
    const rows = await this.prisma.$queryRaw<{ tag: string; count: number }[]>`
      SELECT tag, count(*)::int AS count
      FROM "Story" s, unnest(s."tags") AS tag
      ${whereClause(filters)}
      GROUP BY tag`;
    return new Map(rows.map(({ tag, count }) => [tag, count]));
  }
}
