import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '@/config/features';
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

  it('AC-L7 shows the Tech Radar tile only while the radar flag is on', () => {
    const titles = (radar: boolean) =>
      visibleTiles({ ...FEATURES, radar }).map((tile) => tile.title);
    expect(titles(false)).not.toContain('Tech Radar');
    expect(titles(true)).toContain('Tech Radar');
  });

  it('AC-L7 shows the Collections & notes tile only while the collections flag is on', () => {
    const titles = (collections: boolean) =>
      visibleTiles({ ...FEATURES, collections }).map((tile) => tile.title);
    expect(titles(false)).not.toContain('Collections & notes');
    expect(titles(true)).toContain('Collections & notes');
  });

  it('AC-L7 shows the Ask the News tile only while the copilot flag is on', () => {
    const titles = (copilot: boolean) =>
      visibleTiles({ ...FEATURES, copilot }).map((tile) => tile.title);
    expect(titles(false)).not.toContain('Ask the News');
    expect(titles(true)).toContain('Ask the News');
  });
});
