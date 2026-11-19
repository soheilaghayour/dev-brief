import { describe, expect, it } from 'vitest';
import { safeCallbackUrl } from './safeCallbackUrl';

describe('safeCallbackUrl', () => {
  it('keeps a same-origin relative path with its query', () => {
    expect(safeCallbackUrl('/feed?tags=react&sort=latest')).toBe('/feed?tags=react&sort=latest');
    expect(safeCallbackUrl('/story/abc')).toBe('/story/abc');
  });

  it('falls back to /feed when there is no callbackURL', () => {
    expect(safeCallbackUrl(null)).toBe('/feed');
    expect(safeCallbackUrl(undefined)).toBe('/feed');
    expect(safeCallbackUrl('')).toBe('/feed');
  });

  it('rejects absolute, protocol-relative and scheme URLs', () => {
    for (const unsafe of [
      'https://evil.example/feed',
      'http://localhost:3000/feed',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'feed',
      '/\t/evil.example',
    ]) {
      expect(safeCallbackUrl(unsafe)).toBe('/feed');
    }
  });
});
