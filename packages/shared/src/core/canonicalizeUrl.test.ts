import { describe, expect, it } from 'vitest';
import { canonicalizeUrl } from './canonicalizeUrl.js';

describe('canonicalizeUrl', () => {
  it.each([
    ['utm_source', 'https://example.com/post?utm_source=x'],
    ['utm_medium', 'https://example.com/post?utm_medium=email'],
    ['utm_campaign', 'https://example.com/post?utm_campaign=spring'],
    ['any utm_* param', 'https://example.com/post?utm_whatever=1'],
    ['uppercase UTM_*', 'https://example.com/post?UTM_SOURCE=x'],
    ['ref', 'https://example.com/post?ref=newsletter'],
    ['fbclid', 'https://example.com/post?fbclid=abc'],
    ['gclid', 'https://example.com/post?gclid=abc'],
  ])('strips %s', (_name, url) => {
    expect(canonicalizeUrl(url)).toBe('https://example.com/post');
  });

  it.each([
    ['www.', 'https://www.example.com/post', 'https://example.com/post'],
    ['the trailing slash', 'https://example.com/post/', 'https://example.com/post'],
    ['the root slash', 'https://example.com/', 'https://example.com'],
    ['the fragment', 'https://example.com/post#section', 'https://example.com/post'],
    ['host case', 'https://EXAMPLE.Com/Post', 'https://example.com/Post'],
  ])('normalises %s', (_name, url, expected) => {
    expect(canonicalizeUrl(url)).toBe(expected);
  });

  it('sorts the query by name, then value', () => {
    expect(canonicalizeUrl('https://example.com/p?b=2&a=2&a=1')).toBe(
      'https://example.com/p?a=1&a=2&b=2',
    );
  });

  it('keeps meaningful params', () => {
    expect(canonicalizeUrl('https://news.ycombinator.com/item?id=123')).toBe(
      'https://news.ycombinator.com/item?id=123',
    );
  });

  it('keeps meaningful params while stripping tracking ones', () => {
    expect(canonicalizeUrl('https://example.com/p?z=1&utm_source=x&a=2&ref=y')).toBe(
      'https://example.com/p?a=2&z=1',
    );
  });

  it('keeps the port, the scheme and the path case', () => {
    expect(canonicalizeUrl('http://example.com:8080/Docs/')).toBe('http://example.com:8080/Docs');
  });

  it('trims surrounding whitespace', () => {
    expect(canonicalizeUrl('  https://example.com/post  ')).toBe('https://example.com/post');
  });

  it('canonicalises two variants of one article URL equal', () => {
    expect(canonicalizeUrl('https://www.Example.com/post/?utm_source=x#top')).toBe(
      canonicalizeUrl('https://example.com/post'),
    );
  });

  it('is idempotent', () => {
    const once = canonicalizeUrl('https://www.Example.com/a/?b=1&utm_x=2&a=3#f');
    expect(canonicalizeUrl(once)).toBe(once);
  });

  it('throws on a URL that is not http(s)', () => {
    expect(() => canonicalizeUrl('mailto:a@b.com')).toThrow();
    expect(() => canonicalizeUrl('javascript:alert(1)')).toThrow();
  });

  it('throws on a string that is not a URL', () => {
    expect(() => canonicalizeUrl('not a url')).toThrow();
  });
});
