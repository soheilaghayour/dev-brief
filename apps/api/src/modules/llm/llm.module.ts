import { createAnthropic } from '@ai-sdk/anthropic';
import { Module } from '@nestjs/common';
import { ENV, type Env } from '../../common/env/env.module.js';
import { budgetFromEnv } from './budget.js';
import { LANGUAGE_MODEL, LlmService } from './llm.service.js';
import { LLM_BUDGET, SpendLedgerService } from './spendLedger.service.js';

/** The model client and its spend ledger; feature modules call models only through `LlmService`. */
@Module({
  providers: [
    // Built at boot, so an LLM_MODEL without a price stops the API from starting.
    { provide: LLM_BUDGET, inject: [ENV], useFactory: (env: Env) => budgetFromEnv(env) },
    {
      provide: LANGUAGE_MODEL,
      inject: [ENV],
      useFactory: (env: Env) => createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(env.LLM_MODEL),
    },
    SpendLedgerService,
    LlmService,
  ],
  exports: [LlmService, SpendLedgerService, LLM_BUDGET],
})
export class LlmModule {}
