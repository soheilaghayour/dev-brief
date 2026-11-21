import { describe, expect, it } from 'vitest';
import { collectionSlug } from './collectionSlug.js';

describe('collectionSlug', () => {
  it('joins lowercase ASCII words with hyphens', () => {
    expect(collectionSlug('  Read   Later: Rust & Go! ', [])).toBe('read-later-rust-go');
  });

  it('strips accents instead of dropping the letters', () => {
    expect(collectionSlug('Café Résumé Ñandú', [])).toBe('cafe-resume-nandu');
  });

  it.each([
    ['Straße', 'strasse'],
    ['Søren', 'soren'],
    ['Æther', 'aether'],
    ['Cœur', 'coeur'],
    ['Łódź', 'lodz'],
    ['Đorđe', 'dorde'],
    ['Þing', 'thing'],
    ['ØL ÆR ŒUF ŁÓDŹ ĐA ÞOR', 'ol-aer-oeuf-lodz-da-thor'],
  ])('transliterates %s to %s', (name, slug) => {
    expect(collectionSlug(name, [])).toBe(slug);
  });

  it('falls back to collection-<hash of the name> when no ASCII word is left, so different names differ', () => {
    const japanese = collectionSlug('日本語', []);
    const rockets = collectionSlug('🚀🚀', []);
    expect(japanese).toMatch(/^collection-[0-9a-z]{6}$/);
    expect(rockets).toMatch(/^collection-[0-9a-z]{6}$/);
    expect(japanese).not.toBe(rockets);
    expect(collectionSlug('日本語', [])).toBe(japanese);
  });

  it('appends -2, -3 … on a clash, taking the first free number', () => {
    expect(collectionSlug('Rust', ['rust'])).toBe('rust-2');
    expect(collectionSlug('Rust', ['rust', 'rust-2'])).toBe('rust-3');
    expect(collectionSlug('Rust', new Set(['rust', 'rust-3']))).toBe('rust-2');
    const base = collectionSlug('🔥', []);
    expect(collectionSlug('🔥', [base])).toBe(`${base}-2`);
  });

  it('cuts a long name without leaving a trailing hyphen', () => {
    expect(collectionSlug(`${'a'.repeat(59)} bbbb`, [])).toBe('a'.repeat(59));
  });
});
