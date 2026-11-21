// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { StorySummary } from '@devbrief/shared';
import { SummaryPanel } from './SummaryPanel';

vi.mock('./SummarizeButton', () => ({ SummarizeButton: () => <button>Summarize</button> }));

const SUMMARY: StorySummary = {
  storyId: 'story-1',
  tldr: ['<img src=x onerror=alert(1)>', '**bold** claim', 'Third point'],
  consensus: {
    verdict: 'mixed',
    pros: ['Fast'],
    cons: ['Young'],
    basedOnComments: 46,
  },
  model: 'claude-haiku-5-5',
  createdAt: '2026-11-20T10:00:00.000Z',
};

const ORIGIN = {
  url: 'https://blog.example.com/posts/named-args?ref=hn',
  domain: 'blog.example.com',
  sourceNames: ['Hacker News', 'Dev.to'],
};

describe('SummaryPanel', () => {
  it('AC-2.3.6 renders summary text literally and labels it with the comment count', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={SUMMARY} canSummarize origin={ORIGIN} />,
    );

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('**bold** claim');
    expect(html).not.toContain('<strong>');
    expect(html).toContain('AI-generated');
    expect(html).toContain('based on 46 comments');
  });

  it('AC-2.3.11 links to the original page in a new tab, names the sources and sits beside the AI label', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={SUMMARY} canSummarize origin={ORIGIN} />,
    );
    const document = new DOMParser().parseFromString(html, 'text/html');
    const link = document.querySelector('a');

    expect(link?.getAttribute('href')).toBe(ORIGIN.url);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    // The arrow is decorative: the accessible name is the text without it.
    link?.querySelector('[aria-hidden]')?.remove();
    expect(link?.textContent?.trim()).toBe(
      'Read the original on blog.example.com (opens in a new tab)',
    );
    expect(link?.className).toContain('text-sm');
    expect(link?.className).toContain('font-medium');
    expect(html).toContain('Source: Hacker News, Dev.to');
    expect(link?.parentElement?.textContent).toContain('AI-generated');
  });

  it('AC-2.3.11 puts the link in the header, above the TL;DR', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={SUMMARY} canSummarize origin={ORIGIN} />,
    );
    const document = new DOMParser().parseFromString(html, 'text/html');
    const link = document.querySelector('a');
    const tldr = document.querySelector('ul');

    expect(link?.compareDocumentPosition(tldr!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows the verdict with pros and cons', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={SUMMARY} canSummarize origin={ORIGIN} />,
    );

    expect(html).toContain('Mixed');
    expect(html).toContain('Fast');
    expect(html).toContain('Young');
  });

  it('says "Not enough discussion yet" when consensus is null', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel
        storyId="story-1"
        summary={{ ...SUMMARY, consensus: null }}
        canSummarize
        origin={ORIGIN}
      />,
    );

    expect(html).toContain('Not enough discussion yet');
    expect(html).not.toContain('based on');
  });

  it('shows the Summarize button when the story has no summary and can be summarised', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={null} canSummarize origin={ORIGIN} />,
    );

    expect(html).toContain('Summarize');
    expect(html).not.toContain('AI-generated');
  });

  it('AC-2.3.12 renders no button and no placeholder text when canSummarize is false', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={null} canSummarize={false} origin={ORIGIN} />,
    );

    expect(html).toBe('');
  });

  it('AC-2.3.12 still shows an existing summary when canSummarize is false', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={SUMMARY} canSummarize={false} origin={ORIGIN} />,
    );

    expect(html).toContain('AI-generated');
  });
});
