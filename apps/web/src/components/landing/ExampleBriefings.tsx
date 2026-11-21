import { ExampleBriefingTabs } from './ExampleBriefingTabs';
import type { ExampleBriefing } from './exampleBriefingData';
import { SectionHeading } from './SectionHeading';

type ExampleBriefingsProps = { examples: readonly ExampleBriefing[]; isSample: boolean };

/** The example briefings section: the heading and the tabs render on the server, the renderer loads when the panel nears the viewport. */
export function ExampleBriefings({ examples, isSample }: ExampleBriefingsProps) {
  if (examples.length === 0) return null;
  return (
    <section aria-labelledby="examples-title" className="mx-auto max-w-6xl px-4 py-20">
      <SectionHeading
        id="examples-title"
        eyebrow="Ask the News"
        title="Ask a question, get a briefing"
      >
        Real briefings, written once and stored. Opening this page calls no model.
      </SectionHeading>
      {isSample && (
        <p className="text-muted-foreground mb-3 text-right text-[11px]">
          <span className="rounded-sm border px-1.5 leading-5">Sample data</span>
        </p>
      )}
      <ExampleBriefingTabs examples={examples} />
    </section>
  );
}
