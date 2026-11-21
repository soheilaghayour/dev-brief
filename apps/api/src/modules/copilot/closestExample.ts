import { tagStory } from '@devbrief/shared';

type ExampleRow = { question: string; position: number };

function tagsOf(question: string) {
  return tagStory({ title: question, url: '', sourceTags: [], categories: [] });
}

/** The example sharing the most tags with the question; ties go to the lowest `position`, and none are left when there are no examples. */
export function closestExample<EXAMPLE extends ExampleRow>(
  question: string,
  examples: readonly EXAMPLE[],
) {
  const wanted = new Set(tagsOf(question));
  const scored = examples.map((example) => ({
    example,
    shared: tagsOf(example.question).filter((tag) => wanted.has(tag)).length,
  }));
  scored.sort((a, b) => b.shared - a.shared || a.example.position - b.example.position);
  return scored[0]?.example;
}
