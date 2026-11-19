import { Inject, Injectable } from '@nestjs/common';
import type { Health } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { overallStatus, sourceStatus } from '../../common/source-status/sourceStatus.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async check(): Promise<Health> {
    const now = new Date();
    const sources = await this.loadEnabledSources();
    const reported = sources.map((source) => ({
      slug: source.slug,
      kind: source.kind,
      status: sourceStatus(source, now),
      lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
    }));
    return {
      status: overallStatus(reported.map(({ status }) => status)),
      db: 'ok',
      version: this.env.APP_VERSION,
      sources: reported,
    };
  }

  private async loadEnabledSources() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ApiException('UPSTREAM_UNAVAILABLE', 'The database is unreachable.');
    }
    return this.prisma.source.findMany({
      where: { enabled: true },
      orderBy: [{ kind: 'asc' }, { slug: 'asc' }],
    });
  }
}
