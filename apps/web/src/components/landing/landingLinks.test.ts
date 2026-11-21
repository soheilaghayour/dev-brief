import { describe, expect, it } from 'vitest';
import { LANDING_NAV } from './landingLinks';

describe('LANDING_NAV', () => {
  it('AC-L7 always lists the Radar link', () => {
    expect(LANDING_NAV.map((link) => link.label)).toEqual(['Feed', 'Radar', 'GitHub']);
  });
});
