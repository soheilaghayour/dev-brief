import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/landing/loadLandingData', () => ({ loadLandingData: vi.fn() }));

const { metadata } = await import('./page');

const TITLE = 'DevBrief — Your morning tech scan in 5 minutes';

describe('landing metadata', () => {
  it('AC-L9 pins the page title, Open Graph title and Twitter title to the hero line', () => {
    expect(metadata.title).toEqual({ absolute: TITLE });
    expect(metadata.openGraph?.title).toBe(TITLE);
    expect(metadata.twitter?.title).toBe(TITLE);
  });
});
