// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queuePendingToast, takePendingToast } from './pendingToast';

const SESSION_KEY = 'devbrief:pending-toast';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe('pendingToast', () => {
  it('returns the queued message once', () => {
    queuePendingToast('account-deleted');
    expect(takePendingToast()).toBe('Your account was deleted.');
    expect(takePendingToast()).toBeNull();
  });

  it('returns null when nothing is queued', () => {
    expect(takePendingToast()).toBeNull();
  });

  it('keeps the toast across a full page load', async () => {
    queuePendingToast('account-deleted');
    vi.resetModules();
    const reloaded = await import('./pendingToast');
    expect(reloaded.takePendingToast()).toBe('Your account was deleted.');
  });

  it('keeps the toast in memory when sessionStorage throws', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    queuePendingToast('account-deleted');
    expect(takePendingToast()).toBe('Your account was deleted.');
    expect(takePendingToast()).toBeNull();
  });

  it('ignores and clears a toast queued more than 10 seconds ago', () => {
    vi.useFakeTimers();
    queuePendingToast('account-deleted');
    vi.advanceTimersByTime(10_001);
    expect(takePendingToast()).toBeNull();
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('ignores a stored value it does not know', () => {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ kind: 'toString', queuedAt: Date.now() }),
    );
    expect(takePendingToast()).toBeNull();
  });
});
