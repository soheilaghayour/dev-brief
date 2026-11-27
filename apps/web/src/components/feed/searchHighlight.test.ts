import { findMatchRanges, splitSearchPieces } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { excerptSnippet, highlightCard, markSegments } from './searchHighlight';

function marked(text: string, query: string) {
  const ranges = findMatchRanges(text, splitSearchPieces(query));
  return markSegments(text, ranges)
    .filter((segment) => segment.isMatch)
    .map((segment) => segment.text);
}

describe('markSegments', () => {
  it('AC-1.3.14 marks "ai" in "AI" and inside "Maintaining"', () => {
    expect(marked('Maintaining AI agents', 'ai')).toEqual(['ai', 'ai', 'AI']);
  });

  it('AC-1.3.14 merges overlapping pieces into one mark', () => {
    expect(marked('Angular', 'ang gul')).toEqual(['Angul']);
  });

  it('AC-1.3.14 marks every occurrence of a piece', () => {
    expect(marked('Go, go, GO', 'go')).toEqual(['Go', 'go', 'GO']);
  });

  it('AC-1.3.14 returns the text unchanged as plain parts that join back', () => {
    const text = '<b>Tom & "Jerry"</b>';
    const segments = markSegments(text, findMatchRanges(text, ['&']));
    expect(segments.map((segment) => segment.text).join('')).toBe(text);
    expect(segments.filter((segment) => segment.isMatch)).toEqual([{ text: '&', isMatch: true }]);
  });

  it('AC-1.3.14 folds A-Z only: école does not mark ÉCOLE and istanbul does not mark İstanbul', () => {
    expect(marked('ÉCOLE', 'école')).toEqual([]);
    expect(marked('İstanbul', 'istanbul')).toEqual([]);
    expect(marked('École', 'cole')).toEqual(['cole']);
  });

  it('AC-1.3.14 never splits a surrogate pair when a cut q leaves a lone surrogate', () => {
    const lone = '😀'.slice(0, 1);
    expect(marked('a 😀 b', lone)).toEqual(['😀']);
    expect(marked('a 😀 b', '😀'.slice(1))).toEqual(['😀']);
  });

  it('AC-1.3.14 marks a match next to an emoji without including it', () => {
    expect(marked('😀react😀', 'react')).toEqual(['react']);
  });

  it('AC-1.3.14 may end the mark before a combining character', () => {
    expect(marked('cafe' + String.fromCharCode(0x301), 'cafe')).toEqual(['cafe']);
  });
});

describe('excerptSnippet', () => {
  const rangesOf = (excerpt: string, query: string) =>
    findMatchRanges(excerpt, splitSearchPieces(query));

  it('AC-1.3.14 starts a few words before the match and re-bases the ranges', () => {
    const excerpt =
      'Many teams that moved their large codebase found that React hooks changed things.';
    const snippet = excerptSnippet(excerpt, ['React'], rangesOf(excerpt, 'react'));
    expect(snippet?.text).toBe('…codebase found that React hooks changed things.');
    const [range] = snippet!.ranges;
    expect(snippet!.text.slice(range!.start, range!.end)).toBe('React');
  });

  it('AC-1.3.14 shows no leading ellipsis when the match is at the very start', () => {
    const excerpt = 'React is everywhere.';
    expect(excerptSnippet(excerpt, ['react'], rangesOf(excerpt, 'react'))).toEqual({
      text: 'React is everywhere.',
      ranges: [{ start: 0, end: 5 }],
    });
  });

  it('AC-1.3.14 cuts the tail with an ellipsis and shows none when the match is at the very end', () => {
    const long = `${'word '.repeat(60)}end`;
    const tail = excerptSnippet(long, ['end'], rangesOf(long, 'end'));
    expect(tail?.text.startsWith('…')).toBe(true);
    expect(tail?.text.endsWith('end')).toBe(true);
    const head = excerptSnippet(long, ['word'], rangesOf(long, 'word'));
    expect(head?.text.endsWith('…')).toBe(true);
    expect(head!.text.length).toBeLessThanOrEqual(121);
  });

  it('AC-1.3.14 anchors on the earliest piece the title lacks but marks every piece', () => {
    const excerpt = 'Node and Bun compared, then more about Deno later.';
    const snippet = excerptSnippet(excerpt, ['deno', 'bun'], rangesOf(excerpt, 'deno bun node'));
    expect(snippet?.text).toBe(excerpt);
    expect(snippet?.ranges.map(({ start, end }) => excerpt.slice(start, end))).toEqual([
      'Node',
      'Bun',
      'Deno',
    ]);
  });

  it('AC-1.3.14 does not cut an emoji in half at either end', () => {
    const excerpt = `${'😀'.repeat(30)} react ${'😀'.repeat(80)}`;
    const snippet = excerptSnippet(excerpt, ['react'], rangesOf(excerpt, 'react'));
    expect(snippet?.text).not.toMatch(
      /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/,
    );
  });

  it('AC-1.3.14 returns null when the excerpt has none of the pieces', () => {
    expect(excerptSnippet('Nothing here', ['react'], [])).toBeNull();
  });
});

describe('highlightCard', () => {
  it('AC-1.3.14 adds an excerpt line only when a piece is missing from the title', () => {
    const excerpt = 'A deep dive into React.';
    expect(highlightCard('Angular news', excerpt, ['angu', 'react']).snippet?.text).toBe(excerpt);
    expect(highlightCard('Angular React news', excerpt, ['angu', 'react']).snippet).toBeNull();
  });

  it('AC-1.3.14 handles a null excerpt', () => {
    expect(highlightCard('Angular', null, ['angu', 'react'])).toEqual({
      titleRanges: [{ start: 0, end: 4 }],
      snippet: null,
    });
  });
});
