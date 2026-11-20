import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { budgetFromEnv } from './budget.js';
import { SpendCapReachedError } from './llm.errors.js';
import { SpendLedgerService } from './spendLedger.service.js';

const RESERVE_REQUEST = {
  feature: 'summary_auto',
  model: 'claude-haiku-5-5',
  inputTokens: 4_000,
  maxOutputTokens: 700,
} as const;

/** A Prisma client whose interactive transaction fails with `error`; the queries themselves run in the integration tests. */
function ledgerWhoseTransactionThrows(error: Error) {
  const $transaction = vi.fn(async () => {
    throw error;
  });
  const prisma = { $transaction } as unknown as PrismaService;
  return {
    $transaction,
    ledger: new SpendLedgerService(prisma, budgetFromEnv({ LLM_MODEL: 'claude-haiku-5-5' })),
  };
}

describe('SpendLedgerService.reserve', () => {
  it('refuses with SpendCapReachedError when the transaction times out (P2028), failing closed', async () => {
    const timeout = new Prisma.PrismaClientKnownRequestError('Transaction already closed', {
      code: 'P2028',
      clientVersion: 'test',
    });
    const { ledger, $transaction } = ledgerWhoseTransactionThrows(timeout);

    const reservation = ledger.reserve(RESERVE_REQUEST, new Date());

    await expect(reservation).rejects.toBeInstanceOf(SpendCapReachedError);
    await expect(reservation).rejects.toMatchObject({
      feature: 'summary_auto',
      cap: 'ledger_timeout',
      cause: timeout,
    });
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
      maxWait: 5_000,
      timeout: 10_000,
    });
  });

  it('rethrows any other database error unchanged', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { ledger } = ledgerWhoseTransactionThrows(error);

    await expect(ledger.reserve(RESERVE_REQUEST, new Date())).rejects.toBe(error);
  });
});
