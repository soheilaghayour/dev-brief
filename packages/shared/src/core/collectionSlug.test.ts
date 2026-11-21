import { describe, expect, it } from 'vitest';
import { collectionSlug } from './collectionSlug.js';

describe('collectionSlug', () => {
  it('joins lowercase ASCII words with hyphens', () => {
    expect(collectionSlug('  Read   Later: Rust & Go! ', [])).toBe('read-later-rust-go');
  });

  it('strips accents instead of dropping the letters', () => {
    expect(collectionSlug('Café Résumé Ñandú', [])).toBe('cafe-resume-nandu');
  });

  it('falls back to "collection" for a name with no ASCII word, such as emoji only', () => {
    expect(collectionSlug('🔥🚀', [])).toBe('collection');
    expect(collectionSlug('日本語', [])).toBe('collection');
  });

  it('appends -2, -3 … on a clash, taking the first free number', () => {
    expect(collectionSlug('Rust', ['rust'])).toBe('rust-2');
    expect(collectionSlug('Rust', ['rust', 'rust-2'])).toBe('rust-3');
    expect(collectionSlug('Rust', new Set(['rust', 'rust-3']))).toBe('rust-2');
    expect(collectionSlug('🔥', ['collection'])).toBe('collection-2');
  });

  it('cuts a long name without leaving a trailing hyphen', () => {
    expect(collectionSlug(`${'a'.repeat(59)} bbbb`, [])).toBe('a'.repeat(59));
  });
});
