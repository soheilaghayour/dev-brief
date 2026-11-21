'use client';

import type { ComponentProps } from 'react';
import Markdown from 'react-markdown';

// External links never get the opener or a referrer, and search engines don't follow them (§8.6).
// A link whose protocol react-markdown dropped has no target, so only its text is shown.
function NoteLink({ href, children }: ComponentProps<'a'>) {
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  );
}

// An image would load from an address the reader doesn't control (a tracking pixel), so only its alt text is shown;
// react-markdown's `disallowedElements` would drop it, since the alt text is an attribute, not a child.
function NoteImage({ alt }: ComponentProps<'img'>) {
  return <>{alt}</>;
}

// The page's own headings sit above the note, so a note's `#` is at most an h3 and never competes with them.
function shiftedHeading(Tag: 'h3' | 'h4' | 'h5' | 'h6') {
  return function ShiftedHeading({ children }: ComponentProps<'h1'>) {
    return <Tag className="font-semibold">{children}</Tag>;
  };
}

const components = {
  a: NoteLink,
  img: NoteImage,
  h1: shiftedHeading('h3'),
  h2: shiftedHeading('h4'),
  h3: shiftedHeading('h5'),
  h4: shiftedHeading('h6'),
  h5: shiftedHeading('h6'),
  h6: shiftedHeading('h6'),
};

/** A note as the reader sees it. Raw HTML and images are not rendered (an image shows its alt text) and unsafe link protocols are dropped. */
export function NotePreview({ note }: { note: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm [&_code]:font-mono [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown skipHtml components={components}>
        {note}
      </Markdown>
    </div>
  );
}
