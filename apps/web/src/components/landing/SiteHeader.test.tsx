import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SiteHeader } from './SiteHeader';

describe('SiteHeader', () => {
  it('AC-1.6.5 has exactly one theme control and no System option', () => {
    const html = renderToStaticMarkup(<SiteHeader />);

    expect(html.match(/Switch to dark theme/g)).toHaveLength(1);
    expect(html).not.toContain('role="radio');
    expect(html).not.toContain('System');
  });
});
