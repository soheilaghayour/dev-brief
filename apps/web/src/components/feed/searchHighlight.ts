import { findMatchRanges } from '@devbrief/shared';
import type { MatchRange } from '@devbrief/shared';

type Segment = { text: string; isMatch: boolean };

// About 3 words of lead-in: at 360 px the line holds ~40 characters, so the match starts in its first half.
const LEAD_CHARS = 24;
// The tail is cut by CSS at the card's edge; this only bounds the markup.
const SNIPPET_CHARS = 120;
const ELLIPSIS = '…';

function isHighSurrogate(text: string, index: number) {
  const code = text.charCodeAt(index);
  return code >= 0xd800 && code <= 0xdbff;
}
function isLowSurrogate(text: string, index: number) {
  const code = text.charCodeAt(index);
  return code >= 0xdc00 && code <= 0xdfff;
}
function splitsPair(text: string, index: number) {
  return index > 0 && isHighSurrogate(text, index - 1) && isLowSurrogate(text, index);
}

/** Splits the text into alternating plain and matched parts; the parts join back to the text. */
export function markSegments(text: string, ranges: MatchRange[]) {
  const segments: Segment[] = [];
  let position = 0;
  for (const { start, end } of ranges) {
    if (start > position) segments.push({ text: text.slice(position, start), isMatch: false });
    segments.push({ text: text.slice(start, end), isMatch: true });
    position = end;
  }
  if (position < text.length) segments.push({ text: text.slice(position), isMatch: false });
  return segments;
}

/** Where the snippet starts: a few words before the anchor, on a word start when one is near. */
function snippetStart(excerpt: string, anchorStart: number) {
  const lead = Math.max(0, anchorStart - LEAD_CHARS);
  if (lead === 0 || /\s/.test(excerpt.charAt(lead - 1))) return lead;
  const gap = excerpt.slice(lead, anchorStart).search(/\s/);
  if (gap === -1) return splitsPair(excerpt, lead) ? lead - 1 : lead;
  return lead + gap + excerpt.slice(lead + gap).search(/\S/);
}

/** One excerpt line cut around the earliest occurrence of a piece the title lacks, with its ranges re-based to the line. */
export function excerptSnippet(excerpt: string, missingPieces: string[], ranges: MatchRange[]) {
  const anchor = findMatchRanges(excerpt, missingPieces)[0];
  if (!anchor) return null;
  const start = snippetStart(excerpt, anchor.start);
  let end = Math.min(excerpt.length, start + SNIPPET_CHARS);
  if (splitsPair(excerpt, end)) end -= 1;
  const prefix = start > 0 ? ELLIPSIS : '';
  const body = excerpt.slice(start, end).trimEnd();
  const text = `${prefix}${body}${end < excerpt.length ? ELLIPSIS : ''}`;
  const rebased = ranges.flatMap((range) => {
    const from = Math.max(range.start, start);
    const to = Math.min(range.end, start + body.length);
    const shift = prefix.length - start;
    return from < to ? [{ start: from + shift, end: to + shift }] : [];
  });
  return { text, ranges: rebased };
}

/** What a search result card marks: the title's ranges and, when a piece is missing from the title, the excerpt line. */
export function highlightCard(title: string, excerpt: string | null, pieces: string[]) {
  const missingPieces = pieces.filter((piece) => findMatchRanges(title, [piece]).length === 0);
  const snippet =
    excerpt && missingPieces.length > 0
      ? excerptSnippet(excerpt, missingPieces, findMatchRanges(excerpt, pieces))
      : null;
  return { titleRanges: findMatchRanges(title, pieces), snippet };
}
