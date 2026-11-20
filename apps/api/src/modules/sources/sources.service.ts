import { Injectable } from '@nestjs/common';
import type { SourceList } from '@devbrief/shared';
import { CACHE_TTL_MS, LruCache } from '../../common/cache/lru.cache.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { hasCompletedRun, sourceStatus } from '../../common/source-status/sourceStatus.js';

const CACHE_KEY = 'sources';

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LruCache,
  ) {}

  async list(): Promise<SourceList> {
    const cached = this.cache.get<SourceList>(CACHE_KEY);
    if (cached) return cached;
    const now = new Date();
    const sources = await this.prisma.source.findMany({
      where: { enabled: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    const list: SourceList = {
      sources: sources.filter(hasCompletedRun).map((source) => ({
        slug: source.slug,
        kind: source.kind,
        name: source.name,
        siteUrl: source.siteUrl,
        status: sourceStatus(source, now),
        lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
      })),
    };
    this.cache.set(CACHE_KEY, list, CACHE_TTL_MS);
    return list;
  }
}
