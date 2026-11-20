// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sonner = { loaded: vi.fn(), success: vi.fn() };

let unmount = () => {};

// doMock after resetModules re-runs the factory per test, so `loaded` counts this test's imports.
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doMock('sonner', () => {
    sonner.loaded();
    return { toast: { success: sonner.success } };
  });
  vi.doMock('@/components/ui/Toaster', () => ({ Toaster: () => <div data-testid="toaster" /> }));
  window.sessionStorage.clear();
});
afterEach(() => unmount());

async function mountPendingToast() {
  const { PendingToast } = await import('./PendingToast');
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<PendingToast />));
  unmount = () => act(() => root.unmount());
  return container;
}

describe('PendingToast', () => {
  it('AC-1.6.2 shows the account-deleted toast queued before the redirect', async () => {
    const { queuePendingToast } = await import('@/lib/toast/pendingToast');
    queuePendingToast('account-deleted');
    const container = await mountPendingToast();
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="toaster"]')).not.toBeNull(),
    );
    expect(sonner.success).toHaveBeenCalledWith('Your account was deleted.');
  });

  it('downloads neither Sonner nor the Toaster when no toast is pending', async () => {
    const container = await mountPendingToast();
    await act(async () => {});
    expect(sonner.loaded).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });
});
