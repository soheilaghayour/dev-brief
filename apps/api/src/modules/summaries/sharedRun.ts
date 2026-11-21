/** AC-2.3.10: a summary string may share at most this many consecutive words with the model's input; 8 or more is a quotation. */
export const SUMMARY_MAX_SHARED_WORDS = 7;

// Characters that carry no word: soft hyphen, zero-width space/joiners, word joiner, BOM. Removed so they can't split a word.
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/gu;
// Lowercasing "İ" leaves "i" plus U+0307, which would split the word.
const COMBINING_DOT = /\u0307/gu;
// Apostrophes are dropped, not split on, so "don't" and "Amiga's" stay one word.
const APOSTROPHES = /['\u2018\u2019\u02BC`]/gu;
// A joiner between two letters or digits keeps "Next.js", "16.0.1", "2026-11-21" and "a@b" one token.
const JOINERS = /(?<=[\p{L}\p{N}])[._/@-](?=[\p{L}\p{N}])/gu;
// Any other non-letter, non-digit is a separator. Scripts without spaces (CJK) stay one token per run: not split into words.
const NOT_WORD_CHARACTERS = /[^\p{L}\p{N}]+/gu;

/** The words of `text` with case, punctuation and whitespace removed from the comparison. */
export function normalisedWords(text: string) {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .toLocaleLowerCase('en')
    .replace(COMBINING_DOT, '')
    .replace(APOSTROPHES, '')
    .replace(JOINERS, '')
    .replace(NOT_WORD_CHARACTERS, ' ')
    .split(' ')
    .filter(Boolean);
}

type IndexedSource = { words: readonly string[]; positions: Map<string, number[]> };

function indexSource(text: string): IndexedSource {
  const words = normalisedWords(text);
  const positions = new Map<string, number[]>();
  words.forEach((word, position) => {
    const seen = positions.get(word);
    if (seen) seen.push(position);
    else positions.set(word, [position]);
  });
  return { words, positions };
}

// The lengths of the runs of `output` words from `start` that `source` also has, one per occurrence; `stop` ends a run early.
function* runsFrom(
  output: readonly string[],
  start: number,
  source: IndexedSource,
  stop: (position: number) => boolean = () => false,
) {
  for (const position of source.positions.get(output[start]!) ?? []) {
    let length = 1;
    while (
      start + length < output.length &&
      !stop(start + length) &&
      output[start + length] === source.words[position + length]
    ) {
      length += 1;
    }
    yield length;
  }
}

/** The checker for `sources`, normalised and indexed once: the longest run of consecutive words its argument shares with any one source (a run never spans two sources), not counting words in a run of more than `SUMMARY_MAX_SHARED_WORDS` shared with `title`, since restating the headline is fine. */
export function sharedRunFinder(sources: readonly string[], title = '') {
  const indexed = sources.map(indexSource);
  const indexedTitle = indexSource(title);
  return (output: string) => {
    const words = normalisedWords(output);
    const restated = new Array<boolean>(words.length).fill(false);
    for (let start = 0; start < words.length; start += 1) {
      for (const length of runsFrom(words, start, indexedTitle)) {
        if (length > SUMMARY_MAX_SHARED_WORDS) restated.fill(true, start, start + length);
      }
    }
    let longest = 0;
    for (const source of indexed) {
      for (let start = 0; start < words.length; start += 1) {
        if (restated[start]) continue;
        for (const length of runsFrom(words, start, source, (position) => restated[position]!)) {
          longest = Math.max(longest, length);
        }
      }
    }
    return longest;
  };
}
