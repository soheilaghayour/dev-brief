import { ExampleBriefingsLoader } from './ExampleBriefingsLoader';
import { ExampleBriefingTabsStatic } from './ExampleBriefingTabsStatic';
import type { ExampleBriefing } from './exampleBriefingData';
import { SAMPLE_LABEL_ID } from './exampleTabStyles';
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
          <span id={SAMPLE_LABEL_ID} className="rounded-sm border px-1.5 leading-5">
            Sample data
          </span>
        </p>
      )}
      <ExampleBriefingsLoader examples={examples} isSample={isSample}>
        <ExampleBriefingTabsStatic examples={examples} isSample={isSample} />
      </ExampleBriefingsLoader>
    </section>
  );
}
