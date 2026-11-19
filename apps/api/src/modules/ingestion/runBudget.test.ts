import { afterEach, describe, expect, it, vi } from 'vitest';
import { RUN_BUDGET_MS, startRunBudget } from './runBudget.js';

describe('startRunBudget', () => {
  afterEach(() => vi.useRealTimers());

  it('aborts the signal once the 4 min budget has passed, and not before', async () => {
    vi.useFakeTimers();
    const { signal } = startRunBudget();
    await vi.advanceTimersByTimeAsync(RUN_BUDGET_MS - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    expect(String(signal.reason)).toContain('Run budget');
  });

  it('does not abort after dispose', async () => {
    vi.useFakeTimers();
    const { signal, dispose } = startRunBudget();
    dispose();
    await vi.advanceTimersByTimeAsync(RUN_BUDGET_MS * 2);
    expect(signal.aborted).toBe(false);
  });
});
