'use client';

import type { ComponentProps } from 'react';
import Markdown from 'react-markdown';

// External links never get the opener or a referrer, and search engines don't follow them (§8.6).
function NoteLink({ href, children }: ComponentProps<'a'>) {
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

/** A note as the reader sees it. Raw HTML in the note is skipped and unsafe link protocols are dropped by react-markdown. */
export function NotePreview({ note }: { note: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm [&_code]:font-mono [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown skipHtml components={{ a: NoteLink }}>
        {note}
      </Markdown>
    </div>
  );
}
