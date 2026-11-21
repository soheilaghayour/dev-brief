import { describe, expect, it } from 'vitest';
import { getLandingNav } from './landingLinks';

describe('getLandingNav', () => {
  it('AC-L7 always lists the Radar link', () => {
    expect(getLandingNav().map((link) => link.label)).toEqual(['Feed', 'Radar', 'GitHub']);
  });
});
