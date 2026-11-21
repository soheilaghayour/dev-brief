/** AC-2.3.10: a summary string may share at most this many consecutive words with the model's input; 8 or more is a quotation. */
export const SUMMARY_MAX_SHARED_WORDS = 7;

// Apostrophes are dropped, not split on, so "don't" and "Amiga's" stay one word; any other non-letter, non-digit is a separator.
const APOSTROPHES = /['’]/gu;
const NOT_WORD_CHARACTERS = /[^\p{L}\p{N}]+/gu;

/** The words of `text` with case, punctuation and whitespace removed from the comparison. */
export function normalisedWords(text: string) {
  return text
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(NOT_WORD_CHARACTERS, ' ')
    .split(' ')
    .filter(Boolean);
}

// Longest common substring of two word lists, one rolling row of lengths.
function longestCommonRun(left: readonly string[], right: readonly string[]) {
  let longest = 0;
  let previous = new Array<number>(right.length + 1).fill(0);
  for (const leftWord of left) {
    const current = new Array<number>(right.length + 1).fill(0);
    for (let index = 1; index <= right.length; index += 1) {
      if (leftWord !== right[index - 1]) continue;
      current[index] = previous[index - 1]! + 1;
      longest = Math.max(longest, current[index]!);
    }
    previous = current;
  }
  return longest;
}

/** The longest run of consecutive words `output` shares with any one of `sources`; a run never spans two sources. */
export function longestSharedRun(output: string, sources: readonly string[]) {
  const outputWords = normalisedWords(output);
  return Math.max(
    0,
    ...sources.map((source) => longestCommonRun(outputWords, normalisedWords(source))),
  );
}
