import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../common/env/env.module.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { OnDemandSummaryService } from './onDemandSummary.service.js';
import type { GenerateResult, SummariesService } from './summaries.service.js';

const summary = { storyId: 'cstory', tldr: ['a', 'b', 'c'] } as GenerateResult['summary'];

// A counter that starts without a row, with the guarded increment, create and decrement the service uses.
function setup(generated: GenerateResult) {
  let count = 0;
  const prisma = {
    story: { findUnique: async () => ({ id: 'cstory', clusterId: null }) },
    summary: { findFirst: async () => null },
    sourceItem: { findMany: async () => [{ commentsCount: 12, source: { kind: 'hn' } }] },
    rateLimitCounter: {
      updateMany: async ({ where }: { where: { count: { lt: number } } }) => {
        if (count === 0 || count >= where.count.lt) return { count: 0 };
        count += 1;
        return { count: 1 };
      },
      create: async () => {
        count = 1;
      },
      update: async () => {
        count -= 1;
      },
    },
  } as unknown as PrismaService;
  const summaries = { generate: vi.fn(async () => generated) } as unknown as SummariesService;
  const service = new OnDemandSummaryService(prisma, summaries, {
    IP_HASH_SECRET: 'unit-test-secret-0123456789abcdef0123',
  } as Env);
  return { service, count: () => count };
}

describe('OnDemandSummaryService quota slot', () => {
  it('AC-2.3.1 gives the slot back when the summary was found stored without a model call', async () => {
    const { service, count } = setup({ kind: 'cached', summary });

    const result = await service.summarize('cstory', { userId: 'u1', ip: '1.2.3.4' });

    expect(result.kind).toBe('cached');
    expect(count()).toBe(0);
  });

  it('AC-2.3.3 keeps the slot when a concurrent call stored the summary during the model request', async () => {
    const { service, count } = setup({ kind: 'raced', summary });

    const result = await service.summarize('cstory', { userId: 'u1', ip: '1.2.3.4' });

    expect(result.kind).toBe('cached');
    expect(count()).toBe(1);
  });
});
