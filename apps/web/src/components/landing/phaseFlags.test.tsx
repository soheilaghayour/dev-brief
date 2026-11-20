import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FEATURES, enabledItems, type Features } from '@/config/features';
import { FeatureBento, visibleTiles } from './FeatureBento';
import { getLandingNav } from './landingLinks';

const ALL_ON: Features = Object.fromEntries(
  Object.keys(FEATURES).map((flag) => [flag, true]),
) as Features;

describe('phase flags on the landing page', () => {
  it('AC-L7 leaves a flagged nav link out of the nav while its flag is off', () => {
    expect(getLandingNav().map((link) => link.label)).toEqual(['Feed', 'GitHub']);
    expect(getLandingNav(ALL_ON).map((link) => link.label)).toContain('Radar');
  });

  it('AC-L7 keeps a flagged item out of the list and its text out of the HTML', () => {
    const items = [{ name: 'p1' }, { name: 'p3', flag: 'copilot' as const }];
    expect(enabledItems(items, FEATURES).map((item) => item.name)).toEqual(['p1']);
    expect(enabledItems(items, ALL_ON).map((item) => item.name)).toEqual(['p1', 'p3']);
  });

  it('AC-L7 renders exactly the three Phase 1 bento tiles', () => {
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
