import { describe, expect, it } from 'vitest';
import { normalizeTitle } from './normalizeTitle.js';

describe('normalizeTitle', () => {
  it.each([
    ['lowercases', 'Hello WORLD', 'hello world'],
    ['strips Show HN:', 'Show HN: My side project', 'my side project'],
    ['strips Ask HN:', 'Ask HN: How do you deploy?', 'how do you deploy'],
    ['strips the prefix in any case', 'SHOW hn: Thing', 'thing'],
    ['strips the prefix with a dash', 'Show HN – Thing', 'thing'],
    ['keeps HN inside a title', 'Why HN loves Rust', 'why hn loves rust'],
    ['strips punctuation', 'Rust: fast, safe & fun!', 'rust fast safe fun'],
    ['joins apostrophes', "Let's go; it's 'fine'", 'lets go its fine'],
    ['collapses whitespace', '  many   spaces\tand\nlines ', 'many spaces and lines'],
    ['keeps digits', 'Go 1.24 released', 'go 1 24 released'],
    ['keeps non-ASCII letters', 'Über café', 'über café'],
    ['folds fullwidth letters', 'ＦＵＬＬ width', 'full width'],
    ['returns empty for punctuation only', '!!! ???', ''],
  ])('%s', (_name, title, expected) => {
    expect(normalizeTitle(title)).toBe(expected);
  });

  it('gives NFC and NFD forms of one title the same result', () => {
    const nfc = 'Ünïcödé café'.normalize('NFC');
    expect(normalizeTitle(nfc.normalize('NFD'))).toBe(normalizeTitle(nfc));
  });

  it('gives identical results for punctuation, case and prefix variants of one title', () => {
    const variants = ['Show HN: Fast  CLI tool!', 'fast cli tool', '  FAST, CLI... tool '];
    expect(new Set(variants.map(normalizeTitle)).size).toBe(1);
  });
});
