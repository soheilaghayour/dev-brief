import { EXAMPLE_QUESTIONS } from '@devbrief/shared';
import { Button } from '@/components/ui/Button';

/** The three suggested questions; picking one asks it. */
export function SuggestionList({ onPick }: { onPick: (question: string) => void }) {
  return (
    <ul aria-label="Suggested questions" className="flex flex-wrap gap-2">
      {EXAMPLE_QUESTIONS.map(({ slug, question }) => (
        <li key={slug}>
          <Button
            variant="outline"
            size="sm"
            className="h-auto py-1 text-left whitespace-normal"
            onClick={() => onPick(question)}
          >
            {question}
          </Button>
        </li>
      ))}
    </ul>
  );
}
