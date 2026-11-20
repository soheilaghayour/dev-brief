import { describe, expect, it } from 'vitest';
import { FEATURES, type Features } from '@/config/features';
import { getLandingNav } from './landingLinks';

const ALL_ON: Features = Object.fromEntries(
  Object.keys(FEATURES).map((flag) => [flag, true]),
) as Features;

describe('getLandingNav', () => {
  it('AC-L7 leaves a flagged nav link out of the nav while its flag is off', () => {
    expect(getLandingNav().map((link) => link.label)).toEqual(['Feed', 'GitHub']);
    expect(getLandingNav(ALL_ON).map((link) => link.label)).toContain('Radar');
  });
});
