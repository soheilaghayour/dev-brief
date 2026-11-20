import { Injectable } from '@nestjs/common';
import type { Stats } from '@devbrief/shared';
import { CACHE_TTL_MS, LruCache } from '../../common/cache/lru.cache.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { hasCompletedRun } from '../../common/source-status/sourceStatus.js';

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
      this.prisma.source.findMany({
        where: { enabled: true },
        select: { lastSuccessAt: true, lastErrorAt: true },
      }),
    ]);
    const lastIngestedAt = sources.reduce<Date | null>(
      (latest, { lastSuccessAt }) =>
        lastSuccessAt && (!latest || lastSuccessAt > latest) ? lastSuccessAt : latest,
      null,
    );
    const stats: Stats = {
      storiesToday,
      sourceCount: sources.filter(hasCompletedRun).length,
      lastIngestedAt: lastIngestedAt?.toISOString() ?? null,
    };
    this.cache.set(CACHE_KEY, stats, CACHE_TTL_MS);
    return stats;
  }
}
