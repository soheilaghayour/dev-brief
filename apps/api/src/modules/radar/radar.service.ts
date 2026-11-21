import { Injectable } from '@nestjs/common';
import type { Radar, RadarQuery } from '@devbrief/shared';
import { LruCache } from '../../common/cache/lru.cache.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { computeTagVelocity, radarStartDay } from '../../common/tag-velocity/tagVelocity.js';

/** How long a radar response stays in the LRU (PRD §8.4); the post-run cache clear cuts it short. */
const RADAR_CACHE_TTL_MS = 3_600_000;

@Injectable()
export class RadarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LruCache,
  ) {}

  async get({ window, metric, tags }: RadarQuery): Promise<Radar> {
    const now = new Date();
    // The day is in the key so a response never outlives the day rollover.
    const cacheKey = `radar:${now.toISOString().slice(0, 10)}:${window}:${metric}:${tags?.join(',') ?? ''}`;
    const cached = this.cache.get<Radar>(cacheKey);
    if (cached) return cached;

    const stats = await this.prisma.tagDailyStat.findMany({
      where: { day: { gte: radarStartDay(window, now) } },
    });
    const radar = computeTagVelocity({ stats, window, metric, now, tags });
    this.cache.set(cacheKey, radar, RADAR_CACHE_TTL_MS);
    return radar;
  }
}
