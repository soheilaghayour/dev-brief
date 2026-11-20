// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queuePendingToast, takePendingToast } from './pendingToast';

afterEach(() => {
  vi.restoreAllMocks();
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

  it('keeps the toast in memory when sessionStorage throws', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    queuePendingToast('account-deleted');
    expect(takePendingToast()).toBe('Your account was deleted.');
    expect(takePendingToast()).toBeNull();
  });

  it('ignores a stored value it does not know', () => {
    window.sessionStorage.setItem('devbrief:pending-toast', 'toString');
    expect(takePendingToast()).toBeNull();
  });
});
