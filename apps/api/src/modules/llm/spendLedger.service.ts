import { Inject, Injectable } from '@nestjs/common';
import { type LlmFeature, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  type Budget,
  capDecision,
  committedUsd,
  costFromUsage,
  type LedgerStatus,
  utcDay,
  worstCaseCostUsd,
} from './budget.js';
import { SpendCapReachedError } from './llm.errors.js';

export const LLM_BUDGET = Symbol('LLM_BUDGET');

/** Combined with the UTC day number, keys the advisory lock that serialises a day's reservations. */
const LEDGER_LOCK_KEY = 8_113_002;

// A reservation waits for the day's lock inside its transaction, so the timeout covers queueing behind others.
const RESERVE_TRANSACTION = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

const MS_PER_DAY = 86_400_000;

export type ReserveRequest = {
  feature: LlmFeature;
  model: string;
  inputTokens: number;
  maxOutputTokens: number;
  userId?: string;
  refId?: string;
};

export type Reservation = { id: string; model: string };

export type TokenUsage = { inputTokens: number; outputTokens: number };

/** The `LlmUsage` ledger: reserves a call's worst case under the daily caps, then settles it at actual usage. */
@Injectable()
export class SpendLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_BUDGET) private readonly budget: Budget,
  ) {}

  /** Inserts a `reserved` row for the call's worst case, or throws `SpendCapReachedError`, also when the ledger can't answer in time. */
  async reserve(request: ReserveRequest, now: Date): Promise<Reservation> {
    try {
      return await this.reserveInTransaction(request, now);
    } catch (error) {
      // P2028: the transaction timed out, so the call can't be shown to fit and fails closed.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028') {
        throw new SpendCapReachedError(request.feature, 'ledger_timeout', { cause: error });
      }
      throw error;
    }
  }

  private async reserveInTransaction(request: ReserveRequest, now: Date): Promise<Reservation> {
    const day = utcDay(now);
    const worstCaseUsd = worstCaseCostUsd(request, this.budget.prices);
    return this.prisma.$transaction(async (tx) => {
      // Raw SQL because Prisma has no advisory-lock API; the lock makes concurrent reservations read each other's rows.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_KEY}::int, ${day.getTime() / MS_PER_DAY}::int)`;
      const rows = await committedRows(tx, day);
      const decision = capDecision(
        {
          spentFeatureUsd: committedUsd(rows.filter((row) => row.feature === request.feature)),
          spentGlobalUsd: committedUsd(rows),
          worstCaseUsd,
          feature: request.feature,
        },
        this.budget.caps,
      );
      if (!decision.allowed) throw new SpendCapReachedError(request.feature, decision.cap);
      const row = await tx.llmUsage.create({
        data: {
          day,
          feature: request.feature,
          model: request.model,
          status: 'reserved' satisfies LedgerStatus,
          reservedUsd: worstCaseUsd.toFixed(6),
          userId: request.userId,
          refId: request.refId,
        },
        select: { id: true },
      });
      return { id: row.id, model: request.model };
    }, RESERVE_TRANSACTION);
  }

  /** Closes a reservation at the cost of the call's actual usage and returns that cost. */
  async settle(reservation: Reservation, usage: TokenUsage) {
    return this.close(reservation, 'settled', usage);
  }

  /** Closes a failed call at its actual usage, or at zero when it never reached the provider. */
  async fail(reservation: Reservation, usage: TokenUsage | null) {
    await this.close(reservation, 'failed', usage);
  }

  /** Today's committed spend across all features, the figure the global cap is enforced against. */
  async spentToday(now: Date) {
    return committedUsd(await committedRows(this.prisma, utcDay(now)));
  }

  private async close(reservation: Reservation, status: LedgerStatus, usage: TokenUsage | null) {
    const costUsd = usage
      ? costFromUsage({ ...usage, model: reservation.model }, this.budget.prices)
      : 0;
    await this.prisma.llmUsage.update({
      where: { id: reservation.id },
      data: {
        status,
        costUsd: costUsd.toFixed(6),
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      },
    });
    return costUsd;
  }
}

async function committedRows(db: Prisma.TransactionClient, day: Date) {
  const groups = await db.llmUsage.groupBy({
    by: ['feature', 'status'],
    where: { day },
    _sum: { reservedUsd: true, costUsd: true },
  });
  return groups.map((group) => ({
    feature: group.feature,
    status: group.status,
    reservedUsd: Number(group._sum.reservedUsd ?? 0),
    costUsd: Number(group._sum.costUsd ?? 0),
  }));
}
