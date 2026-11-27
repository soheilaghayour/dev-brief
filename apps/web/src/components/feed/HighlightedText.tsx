import type { MatchRange } from '@devbrief/shared';
import { markSegments } from './searchHighlight';

// The one definition of how a search match looks; globals.test.ts checks its contrast.
const MARK_CLASS = 'bg-primary/25 text-foreground rounded-sm';

/** The text with each range in a `<mark>`; a plain string when nothing matches. */
export function HighlightedText({ text, ranges }: { text: string; ranges: MatchRange[] }) {
  if (ranges.length === 0) return text;
  return markSegments(text, ranges).map((segment, index) =>
    segment.isMatch ? (
      <mark key={index} className={MARK_CLASS}>
        {segment.text}
      </mark>
    ) : (
      segment.text
    ),
  );
}
