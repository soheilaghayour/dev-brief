import { Test } from '@nestjs/testing';
import { Output } from 'ai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENV, EnvModule } from '../../src/common/env/env.module.js';
import { PrismaModule } from '../../src/common/prisma/prisma.module.js';
import { loadEnv } from '../../src/env.js';
import { utcDay } from '../../src/modules/llm/budget.js';
import { GenerationFailedError, SpendCapReachedError } from '../../src/modules/llm/llm.errors.js';
import { LlmModule } from '../../src/modules/llm/llm.module.js';
import { LANGUAGE_MODEL, LlmService } from '../../src/modules/llm/llm.service.js';
import { SpendLedgerService } from '../../src/modules/llm/spendLedger.service.js';
import {
  mockLanguageModel,
  modelReply,
  RECORDED_USAGE,
  TldrSchema,
  VALID_TLDR as VALID,
} from '../mockLanguageModel.js';
import { useTestDatabase } from './testDatabase.js';

// The SDK sends the output's JSON schema along, and the input estimate counts it.
const sentSchema = await Output.object({ schema: TldrSchema }).responseFormat;
const SCHEMA_CHARS = sentSchema?.type === 'json' ? JSON.stringify(sentSchema.schema).length : 0;
// 8,000 characters with the schema estimate to 4,000 input tokens: with 700 output tokens, the §8.1 worst case of $0.00075.
const SUMMARY_CALL = {
  feature: 'summary_auto',
  schema: TldrSchema,
  system: 's'.repeat(4_000),
  prompt: 'p'.repeat(4_000 - SCHEMA_CHARS),
  maxOutputTokens: 700,
  refId: 'story-1',
} as const;
const WORST_CASE_USAGE = { inputTokens: 4_000, outputTokens: 700 };
// 1,800 × $0.10/1M + 240 × $0.50/1M.
const RECORDED_COST = '0.0003';

describe('LLM spend ledger', () => {
  const yesterday = new Date(utcDay(new Date()).getTime() - 86_400_000);
  const prisma = useTestDatabase();
  let closeModule: (() => Promise<void>) | undefined;

  beforeEach(() => prisma.llmUsage.deleteMany());
  afterEach(() => closeModule?.());

  async function createLlm(
    doGenerate: Parameters<typeof mockLanguageModel>[0],
    envOverrides: Record<string, string> = {},
  ) {
    const model = mockLanguageModel(doGenerate);
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule, PrismaModule, LlmModule],
    })
      .overrideProvider(ENV)
      .useValue(loadEnv({ ...process.env, ...envOverrides }))
      .overrideProvider(LANGUAGE_MODEL)
      .useValue(model)
      .compile();
    closeModule = () => moduleRef.close();
    return { model, llm: moduleRef.get(LlmService), ledger: moduleRef.get(SpendLedgerService) };
  }

  function addUsage(row: {
    feature: 'summary_auto' | 'summary_on_demand' | 'copilot';
    status: 'reserved' | 'settled' | 'failed';
    reservedUsd: string;
    costUsd?: string;
    day?: Date;
  }) {
    return prisma.llmUsage.create({
      data: { day: utcDay(new Date()), model: 'claude-haiku-5-5', ...row },
    });
  }

  it('AC-2.6.1 reserves the worst case before the model runs and settles at the reported usage', async () => {
    let rowsDuringCall: Awaited<ReturnType<typeof prisma.llmUsage.findMany>> = [];
    const { llm, model } = await createLlm(async () => {
      rowsDuringCall = await prisma.llmUsage.findMany();
      return modelReply(VALID);
    });

    const result = await llm.generateStructured({ ...SUMMARY_CALL, userId: 'user-1' });

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(rowsDuringCall).toHaveLength(1);
    expect(rowsDuringCall[0]).toMatchObject({ status: 'reserved', costUsd: null });
    expect(rowsDuringCall[0]?.reservedUsd.toString()).toBe('0.00075');

    const rows = await prisma.llmUsage.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'settled',
      feature: 'summary_auto',
      model: 'claude-haiku-5-5',
      inputTokens: RECORDED_USAGE.inputTokens,
      outputTokens: RECORDED_USAGE.outputTokens,
      userId: 'user-1',
      refId: 'story-1',
      day: utcDay(new Date()),
    });
    expect(rows[0]?.costUsd?.toString()).toBe(RECORDED_COST);
    expect(rows[0]?.reservedUsd.toString()).toBe('0.00075');
    expect(result).toEqual({
      object: VALID,
      usage: { ...RECORDED_USAGE, costUsd: 0.0003 },
      model: 'claude-haiku-5-5',
    });
  });

  it('AC-2.6.1 refuses a call the per-feature cap has no room for, without calling the model', async () => {
    // $0.015 auto cap minus $0.01450 committed leaves less than one $0.00075 worst case.
    await addUsage({
      feature: 'summary_auto',
      status: 'settled',
      reservedUsd: '0.0075',
      costUsd: '0.01',
    });
    await addUsage({ feature: 'summary_auto', status: 'reserved', reservedUsd: '0.0045' });
    const { llm, model } = await createLlm(async () => modelReply(VALID));

    const failure = llm.generateStructured(SUMMARY_CALL);

    await expect(failure).rejects.toBeInstanceOf(SpendCapReachedError);
    await expect(failure).rejects.toMatchObject({ cap: 'feature', feature: 'summary_auto' });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await prisma.llmUsage.count()).toBe(2);
  });

  it('AC-2.6.1 refuses a call the global cap has no room for, without calling the model', async () => {
    // Other features hold $0.0595 of the $0.060 global cap; summary_auto itself has spent nothing.
    await addUsage({
      feature: 'copilot',
      status: 'settled',
      reservedUsd: '0.028',
      costUsd: '0.028',
    });
    await addUsage({
      feature: 'summary_on_demand',
      status: 'failed',
      reservedUsd: '0.012',
      costUsd: '0.012',
    });
    await addUsage({ feature: 'copilot', status: 'reserved', reservedUsd: '0.0195' });
    const { llm, model } = await createLlm(async () => modelReply(VALID));

    await expect(llm.generateStructured(SUMMARY_CALL)).rejects.toMatchObject({
      name: 'SpendCapReachedError',
      cap: 'global',
    });
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("ignores yesterday's spend", async () => {
    await addUsage({
      feature: 'summary_auto',
      status: 'settled',
      reservedUsd: '0.015',
      costUsd: '0.015',
      day: yesterday,
    });
    const { llm } = await createLlm(async () => modelReply(VALID));

    await expect(llm.generateStructured(SUMMARY_CALL)).resolves.toMatchObject({ object: VALID });
  });

  it('AC-2.6.1 lets exactly as many parallel calls through as the cap fits worst cases', async () => {
    const fits = 3;
    const capUsd = '0.00225';
    // The mock bills the full worst case, so a settled call frees no room for a later one.
    const { llm, model } = await createLlm(async () => modelReply(VALID, WORST_CASE_USAGE), {
      LLM_CAP_SUMMARY_AUTO_USD_DAY: capUsd,
    });

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => llm.generateStructured(SUMMARY_CALL)),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(fits);
    expect(rejected.map((result) => result.reason)).toEqual(
      Array.from({ length: 8 - fits }, () => expect.any(SpendCapReachedError)),
    );
    expect(model.doGenerateCalls).toHaveLength(fits);
    expect(await prisma.llmUsage.count({ where: { status: 'settled' } })).toBe(fits);
    expect(await prisma.llmUsage.count()).toBe(fits);
  });

  it('AC-2.6.1 leaves two failed rows at their actual usage when the output fails validation twice', async () => {
    const { llm, model } = await createLlm(async () => modelReply({ tldr: ['only one'] }));

    await expect(llm.generateStructured(SUMMARY_CALL)).rejects.toBeInstanceOf(
      GenerationFailedError,
    );

    expect(model.doGenerateCalls).toHaveLength(2);
    const rows = await prisma.llmUsage.findMany();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        status: 'failed',
        inputTokens: RECORDED_USAGE.inputTokens,
        outputTokens: RECORDED_USAGE.outputTokens,
      });
      expect(row.costUsd?.toString()).toBe(RECORDED_COST);
    }
  });

  it('settles a call that never reached the provider at zero', async () => {
    const { ledger } = await createLlm(async () => modelReply(VALID));
    const reservation = await ledger.reserve(
      { feature: 'copilot', model: 'claude-haiku-5-5', inputTokens: 6_000, maxOutputTokens: 1_500 },
      new Date(),
    );

    await ledger.fail(reservation, null);

    const row = await prisma.llmUsage.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(row).toMatchObject({ status: 'failed', inputTokens: null, outputTokens: null });
    expect(row.costUsd?.toString()).toBe('0');
    expect(row.reservedUsd.toString()).toBe('0.00135');
  });

  it("AC-2.6.1 reports today's committed spend: open reservations at their reserved cost, closed rows at their cost", async () => {
    await addUsage({
      feature: 'summary_auto',
      status: 'settled',
      reservedUsd: '0.00075',
      costUsd: '0.0003',
    });
    await addUsage({ feature: 'copilot', status: 'reserved', reservedUsd: '0.00135' });
    await addUsage({
      feature: 'summary_on_demand',
      status: 'failed',
      reservedUsd: '0.00075',
      costUsd: '0',
    });
    await addUsage({
      feature: 'summary_auto',
      status: 'settled',
      reservedUsd: '0.00075',
      costUsd: '0.0005',
      day: yesterday,
    });
    const { ledger } = await createLlm(async () => modelReply(VALID));

    expect(await ledger.spentToday(new Date())).toBe(0.00165);
  });
});
