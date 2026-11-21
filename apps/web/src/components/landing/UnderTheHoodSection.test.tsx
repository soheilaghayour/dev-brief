import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '@/config/features';
import { UnderTheHoodSection } from './UnderTheHoodSection';

describe('UnderTheHoodSection', () => {
  it('AC-L7 shows the A2UI badge only while the copilot flag is on', () => {
    const html = (copilot: boolean) =>
      renderToStaticMarkup(<UnderTheHoodSection features={{ ...FEATURES, copilot }} />);
    expect(html(false)).not.toContain('A2UI');
    expect(html(true)).toContain('A2UI');
  });
});
