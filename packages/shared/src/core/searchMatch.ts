export type MatchRange = { start: number; end: number };

/** Lower-cases the letters A-Z only, so the length never changes and offsets index the original text. */
export function foldAsciiCase(text: string) {
  return text.replaceAll(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** The distinct whitespace-separated pieces of the search text in first-seen order; punctuation inside a piece stays part of it. */
export function splitSearchPieces(query: string) {
  const trimmed = query.trim();
  return trimmed === '' ? [] : [...new Set(trimmed.split(/\s+/))];
}

/** Where the pieces occur in the text under the A-Z case rule: sorted [start, end) UTF-16 offsets, overlapping and touching ranges merged. */
export function findMatchRanges(text: string, pieces: string[]) {
  const foldedText = foldAsciiCase(text);
  const found: MatchRange[] = [];
  for (const piece of pieces) {
    if (piece === '') continue;
    const foldedPiece = foldAsciiCase(piece);
    // Advancing by one, not by the piece length, finds overlapping occurrences such as "aa" in "aaa".
    for (
      let start = foldedText.indexOf(foldedPiece);
      start !== -1;
      start = foldedText.indexOf(foldedPiece, start + 1)
    ) {
      found.push({ start, end: start + foldedPiece.length });
    }
  }
  found.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MatchRange[] = [];
  for (const range of found) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
