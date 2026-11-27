import type { CSSProperties } from 'react';

// The server-rendered placeholder and the live tabs share these, so swapping one for the other moves nothing.
export const TABLIST_CLASS = 'grid gap-2 md:grid-cols-3';
export const TAB_CLASS = 'h-auto justify-start px-4 py-3 text-left whitespace-normal';
export const SELECTED_TAB_CLASS = 'bg-accent text-accent-foreground border-brand/40';
export const PANEL_CLASS =
  'bg-background mt-4 isolate h-[36rem] overflow-y-auto rounded-lg border p-4 text-left md:px-6';
// The panel scrolls on its own, so the briefing's sticky title sticks to the panel's top, not under the site header.
export const PANEL_STYLE = { '--briefing-sticky-top': '0px' } as CSSProperties;

/** The id of the "Sample data" label, which both tab panels name as their description. */
export const SAMPLE_LABEL_ID = 'examples-sample-label';
