import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FEATURES } from '@/config/features';
import { NavLinks } from './NavLinks';

vi.mock('next/navigation', () => ({ usePathname: () => '/feed' }));

describe('NavLinks', () => {
  it('renders no Radar item while the radar flag is false', () => {
    const html = renderToStaticMarkup(<NavLinks features={{ ...FEATURES, radar: false }} />);
    expect(html).toContain('href="/feed"');
    expect(html).toContain('href="/saved"');
    expect(html).not.toContain('Radar');
    expect(html).not.toContain('/radar');
  });

  it('renders the Radar item once its flag is on', () => {
    const html = renderToStaticMarkup(<NavLinks features={{ ...FEATURES, radar: true }} />);
    expect(html).toContain('href="/radar"');
  });

  it('marks the current page', () => {
    const html = renderToStaticMarkup(<NavLinks />);
    expect(html).toMatch(
      /href="\/feed"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/feed"/,
    );
  });
});
