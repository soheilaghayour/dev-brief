import { Injectable } from '@nestjs/common';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { remainingQuota, type CopilotQuotaPlan } from './copilotQuota.js';

/** The daily copilot slots of `RateLimitCounter`: taken by a guarded increment, given back on a refund. */
@Injectable()
export class CopilotQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Takes one slot in every counter or none, and answers 429 `QUOTA_EXCEEDED` when one is full. The counters are taken one after the other, so a parallel request can be refused for a slot that is given back a moment later (a transient under-grant), but never granted past a limit. */
  async take(quota: CopilotQuotaPlan) {
    const taken: typeof quota.counters = [];
    for (const counter of quota.counters) {
      if (!(await this.takeCounter(counter, quota.day))) {
        await this.release({ ...quota, counters: taken });
        throw new ApiException('QUOTA_EXCEEDED', 'Daily copilot limit reached.', {
          resetsAt: quota.resetsAt.toISOString(),
        });
      }
      taken.push(counter);
    }
  }

  /** Gives back the slot of every counter. */
  async release({ counters, day }: CopilotQuotaPlan) {
    for (const { key } of counters) {
      await this.prisma.rateLimitCounter.update({
        where: { key_day: { key, day } },
        data: { count: { decrement: 1 } },
      });
    }
  }

  /** The limit, the room left in the tightest counter and the reset moment, as the UI shows them. */
  async status(quota: CopilotQuotaPlan) {
    const rows = await this.prisma.rateLimitCounter.findMany({
      where: { day: quota.day, key: { in: quota.counters.map(({ key }) => key) } },
    });
    const counts = quota.counters.map(({ key }) => rows.find((row) => row.key === key)?.count ?? 0);
    return remainingQuota(quota, counts);
  }

  // The limit check is part of the increment, so concurrent requests can't overshoot it.
  private async takeCounter({ key, limit }: CopilotQuotaPlan['counters'][number], day: Date) {
    const increment = () =>
      this.prisma.rateLimitCounter.updateMany({
        where: { key, day, count: { lt: limit } },
        data: { count: { increment: 1 } },
      });
    if ((await increment()).count === 1) return true;
    try {
      await this.prisma.rateLimitCounter.create({ data: { key, day, count: 1 } });
      return true;
    } catch (error) {
      // A parallel first request of the day created the row; fall through to the guarded increment.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
    return (await increment()).count === 1;
  }
}
