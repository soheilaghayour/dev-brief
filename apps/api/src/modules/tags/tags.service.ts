import { Injectable } from '@nestjs/common';
import { TAXONOMY, TAXONOMY_VERSION, type TagList } from '@devbrief/shared';
import { CACHE_TTL_MS, LruCache } from '../../common/cache/lru.cache.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

const CACHE_KEY = 'tags';
const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

/** The first UTC day of the 7-day window that ends with the day of `now`. */
function windowStartDay(now: Date) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (WINDOW_DAYS - 1) * DAY_MS);
}

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LruCache,
  ) {}

  async list(): Promise<TagList> {
    const cached = this.cache.get<TagList>(CACHE_KEY);
    if (cached) return cached;
    const sums = await this.prisma.tagDailyStat.groupBy({
      by: ['tag'],
      where: { day: { gte: windowStartDay(new Date()) } },
      _sum: { storyCount: true },
    });
    const countByTag = new Map(sums.map((row) => [row.tag, row._sum.storyCount ?? 0]));
    const list: TagList = {
      version: TAXONOMY_VERSION,
      tags: TAXONOMY.map(({ slug, label }) => ({
        slug,
        label,
        count7d: countByTag.get(slug) ?? 0,
      })),
    };
    this.cache.set(CACHE_KEY, list, CACHE_TTL_MS);
    return list;
  }
}
