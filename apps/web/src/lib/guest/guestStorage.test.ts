import { describe, expect, it } from 'vitest';
import { createGuestStorage, type StorageBackend } from './guestStorage';

function workingBackend() {
  const items = new Map<string, string>();
  const backend = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  } satisfies StorageBackend;
  return { backend, items };
}

describe('createGuestStorage', () => {
  it('passes reads and writes through to localStorage', () => {
    const { backend, items } = workingBackend();
    const storage = createGuestStorage(() => backend);
    storage.setItem('k', 'v');
    expect(items.get('k')).toBe('v');
    expect(storage.getItem('k')).toBe('v');
    storage.removeItem('k');
    expect(items.has('k')).toBe(false);
    expect(storage.isMemoryOnly()).toBe(false);
  });

  it('AC-1.4.4 keeps saving in memory when localStorage throws on write', () => {
    const { backend } = workingBackend();
    const full = {
      ...backend,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    const storage = createGuestStorage(() => full);
    expect(() => storage.setItem('k', 'v')).not.toThrow();
    expect(storage.getItem('k')).toBe('v');
    expect(storage.isMemoryOnly()).toBe(true);
  });

  it('AC-1.4.4 falls back to memory when reaching localStorage throws', () => {
    const storage = createGuestStorage(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(storage.getItem('k')).toBeNull();
    expect(() => storage.setItem('k', 'v')).not.toThrow();
    expect(storage.getItem('k')).toBe('v');
    expect(() => storage.removeItem('k')).not.toThrow();
    expect(storage.getItem('k')).toBeNull();
    expect(storage.isMemoryOnly()).toBe(true);
  });

  it('AC-1.4.4 falls back to memory when there is no localStorage at all', () => {
    const storage = createGuestStorage(() => null);
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
    expect(storage.isMemoryOnly()).toBe(true);
  });
});
