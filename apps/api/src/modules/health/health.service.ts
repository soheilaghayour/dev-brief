import { Inject, Injectable } from '@nestjs/common';
import type { Health } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { overallStatus, sourceStatus } from '../../common/source-status/sourceStatus.js';

/** /health must answer 503, not hang, when the database host stops responding. */
const DB_CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async check(): Promise<Health> {
    const now = new Date();
    const sources = await this.loadEnabledSourcesOrFail();
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

  private async loadEnabledSourcesOrFail() {
    try {
      return await withTimeout(this.queryEnabledSources(), DB_CHECK_TIMEOUT_MS);
    } catch {
      throw new ApiException('UPSTREAM_UNAVAILABLE', 'The database is unreachable.');
    }
  }

  private async queryEnabledSources() {
    await this.prisma.$queryRaw`SELECT 1`;
    return this.prisma.source.findMany({
      where: { enabled: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
