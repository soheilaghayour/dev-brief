import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '@/config/features';
import { FeatureBento, visibleTiles } from './FeatureBento';

describe('FeatureBento', () => {
  it('renders the Radar tile with every flag off, and no copilot text', () => {
    expect(
      visibleTiles({
        ...FEATURES,
        clusters: false,
        summaries: false,
        copilot: false,
        collections: false,
      }),
    ).toHaveLength(3);
    const html = renderToStaticMarkup(<FeatureBento />);
    for (const title of ['Guest mode, real features', 'Fair cross-source ranking', 'Tech Radar']) {
      expect(html).toContain(title);
    }
    expect(html).not.toContain('Ask the News');
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

  it('fills the first row: Ranking and Guest span three columns together', () => {
    const [first, second] = visibleTiles({ ...FEATURES, copilot: false, collections: false });
    expect(first?.title).toBe('Fair cross-source ranking');
    expect(second?.title).toBe('Guest mode, real features');
    expect(first?.className).toBe('md:col-span-2');
    expect(second?.className).toBeUndefined();
  });
});
