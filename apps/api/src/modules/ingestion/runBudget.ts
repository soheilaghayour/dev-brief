import { RUN_BUDGET_MESSAGE } from './ingestionRules.js';

export const RUN_BUDGET_MS = 4 * 60 * 1000;

/** A signal that aborts after the whole-run budget; `dispose` stops the timer when the run ends first. */
export function startRunBudget(budgetMs = RUN_BUDGET_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(RUN_BUDGET_MESSAGE)), budgetMs);
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}
