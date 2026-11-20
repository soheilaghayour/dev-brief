import { KeycapRow } from './KeycapRow';
import { SectionHeading } from './SectionHeading';

/** The Raycast-style keycap section; only the row is interactive. */
export function KeyboardShowcase() {
  return (
    <section aria-labelledby="keys-title" className="bg-muted/30 border-y">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading
          id="keys-title"
          eyebrow="Keyboard"
          title="Read the whole feed without touching the mouse"
        >
          Press a key while this section is in view.
        </SectionHeading>
        <KeycapRow />
      </div>
    </section>
  );
}
