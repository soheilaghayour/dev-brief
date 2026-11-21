import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SourceStrip } from './SourceStrip';

describe('SourceStrip', () => {
  it('names the enabled sources and no blog', () => {
    const text = renderToStaticMarkup(<SourceStrip />).replaceAll(/<[^>]+>/g, '');

    expect(text).toBe('Hacker News·Dev.to·GitHub');
    expect(text).not.toMatch(/blog|vercel|cloudflare|netflix|shopify|willison|comeau/i);
  });
});
