import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeatureBento, visibleTiles } from './FeatureBento';

describe('FeatureBento', () => {
  it('AC-L7 renders exactly the three Phase 1 tiles and no Phase 3 text', () => {
    expect(visibleTiles()).toHaveLength(3);
    const html = renderToStaticMarkup(<FeatureBento />);
    for (const title of [
      'Keyboard-first feed',
      'Guest mode, real features',
      'Fair cross-source ranking',
    ]) {
      expect(html).toContain(title);
    }
    expect(html).not.toContain('Ask the News');
  });
});
