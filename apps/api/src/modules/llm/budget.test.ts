import { describe, expect, it } from 'vitest';
import {
  LLM_CAP_CLUSTER_USD_DAY,
  LLM_CAP_COPILOT_USD_DAY,
  LLM_CAP_GLOBAL_USD_DAY,
  LLM_CAP_SUMMARY_AUTO_USD_DAY,
  LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY,
  budgetFromEnv,
  capDecision,
  committedUsd,
  costFromUsage,
  estimateTokens,
  truncateToTokens,
  worstCaseCostUsd,
} from './budget.js';

const defaultBudget = budgetFromEnv({ LLM_MODEL: 'claude-haiku-5-5' });

describe('budgetFromEnv', () => {
  it('AC-2.6.1 defaults to the §8.1 caps and the seeded Haiku 5.5 price', () => {
    expect(defaultBudget).toEqual({
      model: 'claude-haiku-5-5',
      caps: {
        summary_auto: 0.225,
        summary_on_demand: 0.012,
        cluster: 0.02,
        copilot: 0.028,
        global: 0.32,
      },
      prices: { 'claude-haiku-5-5': { inputPerMTok: 0.1, outputPerMTok: 0.5 } },
    });
  });

  it('§8.1 AC-2.6.1 keeps the feature caps under the global cap and 31 global days under $10', () => {
    const featureCaps = [
      LLM_CAP_SUMMARY_AUTO_USD_DAY,
      LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY,
      LLM_CAP_CLUSTER_USD_DAY,
      LLM_CAP_COPILOT_USD_DAY,
    ];
    const featureTotalMicroUsd = Math.round(featureCaps.reduce((sum, cap) => sum + cap, 0) * 1e6);

    expect(LLM_CAP_SUMMARY_AUTO_USD_DAY).toBe(0.225);
    expect(LLM_CAP_GLOBAL_USD_DAY).toBe(0.32);
    // 0.225 + 0.012 + 0.020 + 0.028
    expect(featureTotalMicroUsd).toBe(285_000);
    expect(featureTotalMicroUsd).toBeLessThanOrEqual(Math.round(LLM_CAP_GLOBAL_USD_DAY * 1e6));
    for (const cap of featureCaps) expect(cap).toBeLessThanOrEqual(LLM_CAP_GLOBAL_USD_DAY);
    // 31 × 0.32 = 9.92
    expect(Math.round(31 * LLM_CAP_GLOBAL_USD_DAY * 1e6)).toBe(9_920_000);
    expect(31 * LLM_CAP_GLOBAL_USD_DAY).toBeLessThan(10);
  });

  it('AC-2.6.1 applies every cap and price override from env', () => {
    const budget = budgetFromEnv({
      LLM_MODEL: 'claude-haiku-5-5',
      LLM_CAP_SUMMARY_AUTO_USD_DAY: 0.001,
      LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY: 0.002,
      LLM_CAP_CLUSTER_USD_DAY: 0.005,
      LLM_CAP_COPILOT_USD_DAY: 0.003,
      LLM_CAP_GLOBAL_USD_DAY: 0.004,
      LLM_PRICE_INPUT_PER_MTOK: 1,
      LLM_PRICE_OUTPUT_PER_MTOK: 5,
    });
    expect(budget.caps).toEqual({
      summary_auto: 0.001,
      summary_on_demand: 0.002,
      cluster: 0.005,
      copilot: 0.003,
      global: 0.004,
    });
    expect(budget.prices['claude-haiku-5-5']).toEqual({ inputPerMTok: 1, outputPerMTok: 5 });
  });

  it('applies the price overrides to the configured model and keeps the seeded table', () => {
    const budget = budgetFromEnv({
      LLM_MODEL: 'other-model',
      LLM_PRICE_INPUT_PER_MTOK: 2,
      LLM_PRICE_OUTPUT_PER_MTOK: 8,
    });
    expect(budget.prices).toEqual({
      'claude-haiku-5-5': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
      'other-model': { inputPerMTok: 2, outputPerMTok: 8 },
    });
  });

  it('refuses a model with no price, so spend is never computed as zero', () => {
    expect(() => budgetFromEnv({ LLM_MODEL: 'other-model' })).toThrow(/other-model has no price/);
    expect(() => budgetFromEnv({ LLM_MODEL: 'other-model', LLM_PRICE_INPUT_PER_MTOK: 2 })).toThrow(
      /LLM_PRICE_OUTPUT_PER_MTOK/,
    );
  });
});

describe('estimateTokens', () => {
  it('counts one token per two characters, rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('ab')).toBe(1);
    expect(estimateTokens('abc')).toBe(2);
    expect(estimateTokens('x'.repeat(8_000))).toBe(4_000);
  });

  it('counts UTF-8 bytes, so CJK text and emoji are not under-estimated', () => {
    // Three bytes per CJK character, four per emoji.
    expect(estimateTokens('日本語')).toBe(5);
    expect(estimateTokens('😀')).toBe(2);
    expect(estimateTokens('é')).toBe(1);
  });
});

describe('truncateToTokens', () => {
  it('keeps text within the budget unchanged and cuts longer text to the budget', () => {
    expect(truncateToTokens('abcd', 2)).toBe('abcd');
    expect(truncateToTokens('abcdef', 2)).toBe('abcd');
    expect(estimateTokens(truncateToTokens('x'.repeat(5_001), 1_000))).toBe(1_000);
  });

  it('cuts multi-byte text by its bytes and never inside a character', () => {
    expect(truncateToTokens('abc😀def', 2)).toBe('abc');
    expect(truncateToTokens('😀def', 2)).toBe('😀');
    expect(truncateToTokens('日本語', 2)).toBe('日');
    const cjk = '語'.repeat(1_000);
    expect(estimateTokens(truncateToTokens(cjk, 100))).toBeLessThanOrEqual(100);
  });
});

describe('cost math', () => {
  it('AC-2.6.1 prices the §8.1 worst case of 4,000 input and 700 output tokens at $0.00075', () => {
    expect(
      worstCaseCostUsd(
        { inputTokens: 4_000, maxOutputTokens: 700, model: 'claude-haiku-5-5' },
        defaultBudget.prices,
      ),
    ).toBe(0.00075);
  });

  it('AC-2.6.1 prices actual usage with the model price', () => {
    expect(
      costFromUsage(
        { inputTokens: 1_800, outputTokens: 240, model: 'claude-haiku-5-5' },
        defaultBudget.prices,
      ),
    ).toBe(0.0003);
  });

  it('rounds a fraction of a micro-dollar up, but not float noise', () => {
    const prices = defaultBudget.prices;
    expect(
      costFromUsage({ inputTokens: 3, outputTokens: 0, model: 'claude-haiku-5-5' }, prices),
    ).toBe(0.000001);
    expect(
      costFromUsage({ inputTokens: 30, outputTokens: 0, model: 'claude-haiku-5-5' }, prices),
    ).toBe(0.000003);
  });

  it('throws for a model without a price', () => {
    expect(() =>
      costFromUsage({ inputTokens: 1, outputTokens: 1, model: 'unknown' }, defaultBudget.prices),
    ).toThrow(/unknown/);
  });
});

describe('capDecision', () => {
  const caps = defaultBudget.caps;

  it('AC-2.6.1 allows a call that lands exactly on the feature cap', () => {
    expect(
      capDecision(
        {
          spentFeatureUsd: 0.22425,
          spentGlobalUsd: 0.22425,
          worstCaseUsd: 0.00075,
          feature: 'summary_auto',
        },
        caps,
      ),
    ).toEqual({ allowed: true });
  });

  it('AC-2.6.1 refuses a call one micro-dollar over the feature cap', () => {
    expect(
      capDecision(
        {
          spentFeatureUsd: 0.224251,
          spentGlobalUsd: 0.224251,
          worstCaseUsd: 0.00075,
          feature: 'summary_auto',
        },
        caps,
      ),
    ).toEqual({ allowed: false, cap: 'feature' });
  });

  it('§8.1 / AC-2.6.1 fits 300 auto reservations of $0.00075 under the auto cap and refuses the 301st', () => {
    const worstCaseUsd = 0.00075;
    let spent = 0;
    for (let call = 1; call <= 300; call++) {
      expect(
        capDecision(
          { spentFeatureUsd: spent, spentGlobalUsd: spent, worstCaseUsd, feature: 'summary_auto' },
          caps,
        ),
      ).toEqual({ allowed: true });
      spent += worstCaseUsd;
    }
    expect(
      capDecision(
        { spentFeatureUsd: spent, spentGlobalUsd: spent, worstCaseUsd, feature: 'summary_auto' },
        caps,
      ),
    ).toEqual({ allowed: false, cap: 'feature' });
  });

  it('§8.1 settled spend: 500 summaries at the measured $0.000409 fit under the auto cap', () => {
    const settledUsd = 0.000409;
    expect(
      capDecision(
        {
          spentFeatureUsd: 499 * settledUsd,
          spentGlobalUsd: 499 * settledUsd,
          worstCaseUsd: 0.00075,
          feature: 'summary_auto',
        },
        caps,
      ),
    ).toEqual({ allowed: true });
  });

  it('§8.1 / AC-2.6.1 fits 160 cluster decisions of $0.000125 under the cluster cap and refuses the 161st', () => {
    const worstCaseUsd = 0.000125;
    let spent = 0;
    for (let call = 1; call <= 160; call++) {
      expect(
        capDecision(
          { spentFeatureUsd: spent, spentGlobalUsd: spent, worstCaseUsd, feature: 'cluster' },
          caps,
        ),
      ).toEqual({ allowed: true });
      spent += worstCaseUsd;
    }
    expect(
      capDecision(
        { spentFeatureUsd: spent, spentGlobalUsd: spent, worstCaseUsd, feature: 'cluster' },
        caps,
      ),
    ).toEqual({ allowed: false, cap: 'feature' });
  });

  it('AC-2.6.1 lets the global cap refuse a copilot call that passes $0.32, as when env raised a feature cap', () => {
    const spend = { worstCaseUsd: 0.0005, feature: 'copilot', spentFeatureUsd: 0.0165 } as const;
    expect(capDecision({ ...spend, spentGlobalUsd: 0.3195 }, caps)).toEqual({ allowed: true });
    expect(capDecision({ ...spend, spentGlobalUsd: 0.319501 }, caps)).toEqual({
      allowed: false,
      cap: 'global',
    });
  });

  it('AC-2.6.1 refuses a call that fits its feature but not the global cap', () => {
    const spend = { spentFeatureUsd: 0, worstCaseUsd: 0.00075, feature: 'copilot' } as const;
    expect(capDecision({ ...spend, spentGlobalUsd: 0.31925 }, caps)).toEqual({ allowed: true });
    expect(capDecision({ ...spend, spentGlobalUsd: 0.319251 }, caps)).toEqual({
      allowed: false,
      cap: 'global',
    });
  });

  it('checks each feature against its own cap', () => {
    const spend = { spentFeatureUsd: 0.0115, spentGlobalUsd: 0.0115, worstCaseUsd: 0.00075 };
    expect(capDecision({ ...spend, feature: 'summary_on_demand' }, caps)).toEqual({
      allowed: false,
      cap: 'feature',
    });
    expect(capDecision({ ...spend, feature: 'summary_auto' }, caps)).toEqual({ allowed: true });
  });
});

describe('committedUsd', () => {
  it('AC-2.6.1 counts an open reservation at its reserved cost and a closed row at its actual cost', () => {
    expect(
      committedUsd([
        { status: 'reserved', reservedUsd: 0.00075, costUsd: 0 },
        { status: 'settled', reservedUsd: 0.00075, costUsd: 0.0003 },
        { status: 'failed', reservedUsd: 0.00075, costUsd: 0 },
      ]),
    ).toBe(0.00105);
  });

  it('sums 300 worst cases to exactly the auto cap', () => {
    const rows = Array.from({ length: 300 }, () => ({
      status: 'reserved' as const,
      reservedUsd: 0.00075,
      costUsd: 0,
    }));
    expect(committedUsd(rows)).toBe(LLM_CAP_SUMMARY_AUTO_USD_DAY);
  });
});
