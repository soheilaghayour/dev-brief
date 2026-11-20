import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

describe('Button asChild', () => {
  it('renders the child link with the button classes merged with its own className', () => {
    const html = renderToStaticMarkup(
      <Button asChild size="sm">
        <a href="/saved" className="custom">
          Saved
        </a>
      </Button>,
    );

    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/saved"');
    expect(html).toContain('data-slot="button"');
    expect(html).toMatch(/class="[^"]*h-7[^"]*custom"/);
  });
});
