import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '@/config/features';
import { FeatureBento, tileSpans, visibleTiles } from './FeatureBento';

describe('FeatureBento', () => {
  it('AC-L7 renders the Radar tile with every flag off, and no copilot text', () => {
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

  it('AC-L7 spans the tiles for every flag combination so no row holds a lone tile', () => {
    for (const copilot of [false, true]) {
      for (const collections of [false, true]) {
        const count = visibleTiles({ ...FEATURES, copilot, collections }).length;
        const rows: number[][] = [[]];
        for (const span of tileSpans(count)) {
          const row = rows.at(-1)!;
          if (row.reduce((sum, width) => sum + width, 0) + span > 3) rows.push([span]);
          else row.push(span);
        }
        for (const row of rows) {
          expect(row.reduce((sum, width) => sum + width, 0)).toBe(3);
          expect(row.length).toBeGreaterThan(1);
        }
      }
    }
  });
});
