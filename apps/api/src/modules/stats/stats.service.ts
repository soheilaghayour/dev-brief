import { Injectable } from '@nestjs/common';
import type { Stats } from '@devbrief/shared';
import { CACHE_TTL_MS, LruCache } from '../../common/cache/lru.cache.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

const CACHE_KEY = 'stats';
const DAY_MS = 86_400_000;

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LruCache,
  ) {}

  async get(): Promise<Stats> {
    const cached = this.cache.get<Stats>(CACHE_KEY);
    if (cached) return cached;
    const [storiesToday, sources] = await Promise.all([
      this.prisma.story.count({ where: { publishedAt: { gte: new Date(Date.now() - DAY_MS) } } }),
      this.prisma.source.aggregate({
        where: { enabled: true },
        _count: { _all: true },
        _max: { lastSuccessAt: true },
      }),
    ]);
    const stats: Stats = {
      storiesToday,
      sourceCount: sources._count._all,
      lastIngestedAt: sources._max.lastSuccessAt?.toISOString() ?? null,
    };
    this.cache.set(CACHE_KEY, stats, CACHE_TTL_MS);
    return stats;
  }
}
