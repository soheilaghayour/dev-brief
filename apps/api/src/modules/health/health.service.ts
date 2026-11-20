import { Inject, Injectable } from '@nestjs/common';
import type { Health } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  hasCompletedRun,
  overallStatus,
  sourceStatus,
} from '../../common/source-status/sourceStatus.js';
import type { Budget } from '../llm/budget.js';
import { LLM_BUDGET, SpendLedgerService } from '../llm/spendLedger.service.js';

/** /health must answer 503, not hang, when the database host stops responding. */
const DB_CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    private readonly ledger: SpendLedgerService,
    @Inject(LLM_BUDGET) private readonly budget: Budget,
  ) {}

  async check(): Promise<Health> {
    const now = new Date();
    const { sources, spentTodayUsd } = await this.loadStateOrFail(now);
    const reported = sources.filter(hasCompletedRun).map((source) => ({
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
      llm: { spentTodayUsd, capUsd: this.budget.caps.global },
    };
  }

  private async loadStateOrFail(now: Date) {
    try {
      return await withTimeout(this.queryState(now), DB_CHECK_TIMEOUT_MS);
    } catch {
      throw new ApiException('UPSTREAM_UNAVAILABLE', 'The database is unreachable.');
    }
  }

  private async queryState(now: Date) {
    await this.prisma.$queryRaw`SELECT 1`;
    const [sources, spentTodayUsd] = await Promise.all([
      this.prisma.source.findMany({
        where: { enabled: true },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      }),
      this.ledger.spentToday(now),
    ]);
    return { sources, spentTodayUsd };
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
