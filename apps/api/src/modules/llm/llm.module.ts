import { createAnthropic } from '@ai-sdk/anthropic';
import { Module } from '@nestjs/common';
import { ENV, type Env } from '../../common/env/env.module.js';
import { budgetFromEnv } from './budget.js';
import { LANGUAGE_MODEL, LlmService } from './llm.service.js';
import { LLM_BUDGET, SpendLedgerService } from './spendLedger.service.js';

// Passed explicitly, so the provider never reads `ANTHROPIC_BASE_URL` or `ANTHROPIC_API_KEY` around `env.ts`.
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

/** The model client and its spend ledger; feature modules call models only through `LlmService`. */
@Module({
  providers: [
    // Built at boot, so an LLM_MODEL without a price stops the API from starting.
    { provide: LLM_BUDGET, inject: [ENV], useFactory: (env: Env) => budgetFromEnv(env) },
    {
      provide: LANGUAGE_MODEL,
      inject: [ENV],
      // No key means no LLM feature is on (env.ts), so the empty key is never sent.
      useFactory: (env: Env) =>
        createAnthropic({ apiKey: env.ANTHROPIC_API_KEY ?? '', baseURL: ANTHROPIC_BASE_URL })(
          env.LLM_MODEL,
        ),
    },
    SpendLedgerService,
    LlmService,
  ],
  exports: [LlmService, SpendLedgerService, LLM_BUDGET],
})
export class LlmModule {}
