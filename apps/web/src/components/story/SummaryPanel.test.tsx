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

describe('SummaryPanel', () => {
  it('AC-2.3.6 renders summary text literally and labels it with the comment count', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={SUMMARY} canSummarize />,
    );

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('**bold** claim');
    expect(html).not.toContain('<strong>');
    expect(html).toContain('AI-generated');
    expect(html).toContain('based on 46 comments');
  });

  it('shows the verdict with pros and cons', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={SUMMARY} canSummarize />,
    );

    expect(html).toContain('Mixed');
    expect(html).toContain('Fast');
    expect(html).toContain('Young');
  });

  it('says "Not enough discussion yet" when consensus is null', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={{ ...SUMMARY, consensus: null }} canSummarize />,
    );

    expect(html).toContain('Not enough discussion yet');
    expect(html).not.toContain('based on');
  });

  it('shows the Summarize button when the story has no summary and can be summarised', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={null} canSummarize />,
    );

    expect(html).toContain('Summarize');
    expect(html).not.toContain('AI-generated');
  });

  it('AC-2.3.12 renders no button and no placeholder text when canSummarize is false', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={null} canSummarize={false} />,
    );

    expect(html).toBe('');
  });

  it('AC-2.3.12 still shows an existing summary when canSummarize is false', () => {
    const html = renderToStaticMarkup(
      <SummaryPanel storyId="story-1" summary={SUMMARY} canSummarize={false} />,
    );

    expect(html).toContain('AI-generated');
  });
});
