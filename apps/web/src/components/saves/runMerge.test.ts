import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const mergeGuestData = vi.hoisted(() => vi.fn());
vi.mock('./mergeGuestData', () => ({ mergeGuestData }));

const { isMergeRunning, runMerge } = await import('./runMerge');

describe('runMerge', () => {
  it('AC-1.5.5 a second caller joins the merge in flight instead of sending it twice', async () => {
    let finish = () => {};
    mergeGuestData.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const queryClient = new QueryClient();

    const first = runMerge(queryClient);
    const second = runMerge(queryClient);
    expect(second).toBe(first);
    expect(isMergeRunning()).toBe(true);

    finish();
    await first;
    expect(mergeGuestData).toHaveBeenCalledTimes(1);
    expect(isMergeRunning()).toBe(false);
  });
});
