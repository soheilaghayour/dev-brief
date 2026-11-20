import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SourceBadge } from './SourceBadge';

const GITHUB = {
  kind: 'github',
  name: 'GitHub',
  points: null,
  comments: null,
  reactions: null,
  stars: 1234,
} as const;

describe('SourceBadge', () => {
  it('AC-2.4.1 shows a GitHub source as GitHub ★ 1.2k, with the full count in the title and for screen readers', () => {
    const html = renderToStaticMarkup(<SourceBadge source={GITHUB} />);
    expect(html).toContain('data-source-kind="github"');
    expect(html).toContain('GitHub</span>');
    expect(html).toContain('title="1,234 stars"');
    expect(html).toContain('★</span><span class="tabular-nums" aria-hidden="true">1.2k</span>');
    expect(html).toContain('<span class="sr-only">1,234 stars</span>');
  });

  it('shows a GitHub source without a star count by its name only', () => {
    const html = renderToStaticMarkup(<SourceBadge source={{ ...GITHUB, stars: null }} />);
    expect(html).toContain('GitHub</span>');
    expect(html).not.toContain('★');
  });
});
