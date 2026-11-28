import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SourceBadge } from './SourceBadge';
import { TagBadge } from './TagBadge';

describe('badges', () => {
  // The story page, Saved and the boards render these same two components.
  it('AC-2.5.1 renders a tag badge and a source badge as plain text that opens no menu', () => {
    const html = renderToStaticMarkup(
      <>
        <TagBadge slug="rust" />
        <SourceBadge
          source={{
            kind: 'hn',
            slug: 'hn',
            name: 'Hacker News',
            points: 10,
            comments: 2,
            reactions: null,
            stars: null,
          }}
        />
      </>,
    );
    expect(html).toContain('data-tag="rust"');
    expect(html).toContain('data-source-kind="hn"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-haspopup');
  });
});
