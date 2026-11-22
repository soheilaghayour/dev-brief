// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/content/landing-fixture.json';
import { HeroSection } from './HeroSection';
import { fixtureStories, type FixtureStory } from './landingStories';
import type { LandingData } from './loadLandingData';

const features = vi.hoisted(() => ({ clusters: false, summaries: false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/config/features', () => ({
  isFeatureEnabled: (flag: 'clusters' | 'summaries') => features[flag],
}));
vi.mock('./usePreviewSaves', () => ({
  usePreviewSaves: () => ({ isReady: false, isSaved: () => false, toggle: vi.fn() }),
}));

afterEach(() => {
  features.clusters = false;
});

const NOW = new Date();
const DATA: LandingData = {
  stories: fixtureStories(fixture.items as FixtureStory[], NOW),
  stats: { storiesToday: 312, sourceCount: 3, lastIngestedAt: NOW.toISOString() },
  isSample: false,
  renderedAt: NOW.toISOString(),
  examples: [],
  examplesAreSample: false,
};

const URL_DEDUP =
  "The same link on Hacker News, Dev.to and GitHub becomes one card, with every source's points and comments side by side.";
const CLUSTER_DEDUP =
  'The same story on Hacker News, Dev.to and GitHub becomes one card, even when each links somewhere else.';
const PULL =
  'DevBrief pulls them all every hour and ranks everything on one fair scale, no account needed.';

function render() {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<HeroSection data={DATA} host="devbrief.dev" />);
  return container;
}

describe('HeroSection', () => {
  it('AC-L12 puts the text left and the window right in a 45/55 grid from md up, text first in the source', () => {
    const container = render();
    const grid = container.querySelector('[data-hero-column="text"]')!.parentElement!;
    expect(grid.className).toContain('md:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]');
    expect([...grid.children].map((column) => column.getAttribute('data-hero-column'))).toEqual([
      'text',
      'preview',
    ]);
    const text = container.querySelector('[data-hero-column="text"]')!;
    expect(text.className).toContain('text-left');
    // A long unbreakable title must shrink inside its column on the single-column layout too.
    for (const column of grid.children) expect(column.className).toContain('min-w-0');
    expect(text.querySelector('h1')!.textContent).toBe('Your morning tech scan in 5 minutes');
    expect(
      container.querySelector('[data-hero-column="preview"] [aria-label="Live feed preview"]'),
    ).not.toBeNull();
  });

  it('AC-L12 renders no radial gradient or glow behind the hero', () => {
    const container = render();
    const backgrounds = [...container.querySelectorAll('*')].filter((element) =>
      /gradient|bg-(linear|radial|conic)|blur|glow/.test(
        `${element.getAttribute('class') ?? ''} ${element.getAttribute('style') ?? ''}`,
      ),
    );
    expect(backgrounds).toEqual([]);
  });

  it('AC-L14 uses the URL-dedup sentences while clustering is off', () => {
    const text = render().querySelector('[data-hero-column="text"] h1 + p')!;
    expect(text.textContent).toBe(`${URL_DEDUP} ${PULL}`);
  });

  it('AC-L14 uses the clusters-on sentences while clustering is on', () => {
    features.clusters = true;
    const text = render().querySelector('[data-hero-column="text"] h1 + p')!;
    expect(text.textContent).toBe(`${CLUSTER_DEDUP} ${PULL}`);
  });

  it('AC-L7 names no blogs in either variant, since the RSS feeds are off', () => {
    for (const clusters of [false, true]) {
      features.clusters = clusters;
      expect(render().querySelector('[data-hero-column="text"]')!.textContent).not.toMatch(/blog/i);
    }
  });
});
