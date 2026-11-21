import type { LlmFeature } from '../../generated/prisma/client.js';

/** Daily spend caps in USD (PRD §8.1); `budgetFromEnv` applies their env overrides. */
export const LLM_CAP_SUMMARY_AUTO_USD_DAY = 0.225;
export const LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY = 0.012;
export const LLM_CAP_CLUSTER_USD_DAY = 0.02;
export const LLM_CAP_COPILOT_USD_DAY = 0.028;
export const LLM_CAP_GLOBAL_USD_DAY = 0.32;

type ModelPrice = { inputPerMTok: number; outputPerMTok: number };

/** USD per 1M tokens, keyed by model (PRD §8.2); prompts stay under 100K tokens, so only the base tier applies. */
export const LLM_PRICES_PER_MTOK: Readonly<Record<string, ModelPrice>> = {
  'claude-haiku-5-5': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
};

/** The values of the plain-string `LlmUsage.status` column. */
export type LedgerStatus = 'reserved' | 'settled' | 'failed';

export type Budget = {
  model: string;
  caps: Record<LlmFeature | 'global', number>;
  prices: Readonly<Record<string, ModelPrice>>;
};

export type BudgetEnv = {
  LLM_MODEL: string;
  LLM_CAP_SUMMARY_AUTO_USD_DAY?: number;
  LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY?: number;
  LLM_CAP_CLUSTER_USD_DAY?: number;
  LLM_CAP_COPILOT_USD_DAY?: number;
  LLM_CAP_GLOBAL_USD_DAY?: number;
  LLM_PRICE_INPUT_PER_MTOK?: number;
  LLM_PRICE_OUTPUT_PER_MTOK?: number;
};

const MICRO_USD_PER_USD = 1_000_000;

/** Builds the caps and the price table, with the env price overrides applied to `LLM_MODEL`; throws when that model has no price. */
export function budgetFromEnv(env: BudgetEnv): Budget {
  const seeded: ModelPrice | undefined = LLM_PRICES_PER_MTOK[env.LLM_MODEL];
  const inputPerMTok = env.LLM_PRICE_INPUT_PER_MTOK ?? seeded?.inputPerMTok;
  const outputPerMTok = env.LLM_PRICE_OUTPUT_PER_MTOK ?? seeded?.outputPerMTok;
  if (inputPerMTok === undefined || outputPerMTok === undefined) {
    throw new Error(
      `LLM_MODEL=${env.LLM_MODEL} has no price: set LLM_PRICE_INPUT_PER_MTOK and LLM_PRICE_OUTPUT_PER_MTOK`,
    );
  }
  return {
    model: env.LLM_MODEL,
    caps: {
      summary_auto: env.LLM_CAP_SUMMARY_AUTO_USD_DAY ?? LLM_CAP_SUMMARY_AUTO_USD_DAY,
      summary_on_demand: env.LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY ?? LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY,
      cluster: env.LLM_CAP_CLUSTER_USD_DAY ?? LLM_CAP_CLUSTER_USD_DAY,
      copilot: env.LLM_CAP_COPILOT_USD_DAY ?? LLM_CAP_COPILOT_USD_DAY,
      global: env.LLM_CAP_GLOBAL_USD_DAY ?? LLM_CAP_GLOBAL_USD_DAY,
    },
    prices: { ...LLM_PRICES_PER_MTOK, [env.LLM_MODEL]: { inputPerMTok, outputPerMTok } },
  };
}

// Haiku 5.5's tokenizer is denser than this, so the estimate over-counts (DECISIONS.md).
const UTF8_BYTES_PER_TOKEN = 2;

// UTF-8 bytes, not UTF-16 units: a CJK character is one unit but three bytes, and often a token of its own.
function utf8Bytes(codePoint: number) {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  return codePoint < 0x10000 ? 3 : 4;
}

/** Over-estimates the token count of `text`; callers hard-truncate their inputs with `truncateToTokens`. */
export function estimateTokens(text: string) {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / UTF8_BYTES_PER_TOKEN);
}

/** Cuts `text`, between whole characters, so that `estimateTokens` of the result is at most `maxTokens`. */
export function truncateToTokens(text: string, maxTokens: number) {
  const maxBytes = maxTokens * UTF8_BYTES_PER_TOKEN;
  let bytes = 0;
  let end = 0;
  for (const character of text) {
    bytes += utf8Bytes(character.codePointAt(0) ?? 0);
    if (bytes > maxBytes) return text.slice(0, end);
    end += character.length;
  }
  return text;
}

/** The most a call can cost: the estimated input plus every output token it may produce, thinking included. */
export function worstCaseCostUsd(
  call: { inputTokens: number; maxOutputTokens: number; model: string },
  prices: Budget['prices'],
) {
  return costFromUsage(
    { inputTokens: call.inputTokens, outputTokens: call.maxOutputTokens, model: call.model },
    prices,
  );
}

/** The cost of a call's tokens, rounded up to the micro-dollar the ledger stores. */
export function costFromUsage(
  usage: { inputTokens: number; outputTokens: number; model: string },
  prices: Budget['prices'],
) {
  const price = prices[usage.model];
  if (!price) throw new Error(`No price for model ${usage.model}`);
  // Tokens × USD per 1M tokens is micro-dollars.
  const microUsd =
    usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok;
  // Float noise (3 × 0.1 = 0.30000000000000004) must not add a micro-dollar.
  return Math.ceil(Number(microUsd.toFixed(6))) / MICRO_USD_PER_USD;
}

/** Whether a call's worst case still fits under its feature's daily cap and the global one. */
export function capDecision(
  spend: {
    spentFeatureUsd: number;
    spentGlobalUsd: number;
    worstCaseUsd: number;
    feature: LlmFeature;
  },
  caps: Budget['caps'],
): { allowed: true } | { allowed: false; cap: 'feature' | 'global' } {
  const worstCase = toMicroUsd(spend.worstCaseUsd);
  if (toMicroUsd(spend.spentFeatureUsd) + worstCase > toMicroUsd(caps[spend.feature])) {
    return { allowed: false, cap: 'feature' };
  }
  if (toMicroUsd(spend.spentGlobalUsd) + worstCase > toMicroUsd(caps.global)) {
    return { allowed: false, cap: 'global' };
  }
  return { allowed: true };
}

/** Committed spend of ledger rows: an open reservation counts its `reservedUsd`, a settled or failed row its `costUsd`. */
export function committedUsd(
  rows: readonly { status: string; reservedUsd: number; costUsd: number }[],
) {
  const microUsd = rows.reduce(
    (sum, row) =>
      sum +
      toMicroUsd(
        row.status === ('reserved' satisfies LedgerStatus) ? row.reservedUsd : row.costUsd,
      ),
    0,
  );
  return microUsd / MICRO_USD_PER_USD;
}

// Integer micro-dollars, so 300 × $0.00075 lands exactly on the $0.225 auto cap.
function toMicroUsd(usd: number) {
  return Math.round(usd * MICRO_USD_PER_USD);
}
