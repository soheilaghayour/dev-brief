import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NavLinks } from './NavLinks';

vi.mock('next/navigation', () => ({ usePathname: () => '/feed' }));

describe('NavLinks', () => {
  it('AC-L7 always renders the Feed, Saved and Radar items', () => {
    const html = renderToStaticMarkup(<NavLinks />);
    expect(html).toContain('href="/feed"');
    expect(html).toContain('href="/saved"');
    expect(html).toContain('href="/radar"');
  });

  it('marks the current page', () => {
    const html = renderToStaticMarkup(<NavLinks />);
    expect(html).toMatch(
      /href="\/feed"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/feed"/,
    );
  });
});
