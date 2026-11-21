// @vitest-environment jsdom
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CardStory } from '@/components/feed/StoryCard';
import fixture from '@/content/landing-fixture.json';
import { HeroPreview } from './HeroPreview';
import { sampleExampleBriefings } from './exampleBriefingData';
import { fixtureStories, type FixtureStory } from './landingStories';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = vi.hoisted(() => ({ push: vi.fn() }));
const features = vi.hoisted(() => ({ clusters: false, summaries: false }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/config/features', () => ({
  isFeatureEnabled: (flag: 'clusters' | 'summaries') => features[flag],
}));
vi.mock('./usePreviewSaves', () => ({
  usePreviewSaves: () => ({ isReady: true, isSaved: () => false, toggle: vi.fn() }),
}));
vi.mock('@/features/copilot/LazyBriefingView', () => ({
  LazyBriefingView: () => <div data-testid="renderer" />,
}));

const STORIES = fixtureStories(fixture.items as FixtureStory[], new Date());
const CLUSTER_CARD = STORIES.find((story) => story.cluster)!;
const [BRIEFING] = sampleExampleBriefings();

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  router.push.mockReset();
  features.clusters = false;
  features.summaries = false;
});

function mount({
  stories = STORIES,
  briefingIsSample = false,
}: { stories?: CardStory[]; briefingIsSample?: boolean } = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <HeroPreview
        stories={stories}
        storiesToday={300}
        isSample={false}
        host="devbrief.dev"
        briefing={BRIEFING}
        briefingIsSample={briefingIsSample}
      />,
    ),
  );
  return container;
}

function staticMarkup(stories: CardStory[] = STORIES) {
  return renderToStaticMarkup(
    <HeroPreview stories={stories} storiesToday={300} isSample={false} host="devbrief.dev" />,
  );
}

// Load the lazy chunk up front so tests wait on the briefing appearing, not on a cold import.
beforeAll(() => import('./HeroBriefing'));

// The briefing module is a lazy chunk, so the click is followed by a short wait for it.
async function showBriefing(container: HTMLElement) {
  act(() => button(container, 'Briefing').click());
  await vi.waitFor(
    async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(container.querySelector('[data-testid="renderer"]')).not.toBeNull();
    },
    { timeout: 5000 },
  );
}

const button = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === name)!;

const previewWindow = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[aria-label="Live feed preview"]')!;
const body = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-preview-body]')!;
const frame = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-preview-frame]')!;
const cards = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('article[data-story-id]'),
];

function press(container: HTMLElement, key: string) {
  act(() => {
    previewWindow(container).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

// jsdom has no layout: each card is 100 px tall, stacked from the frame's top, and the frame shows 400 px.
function stubLayout(container: HTMLElement) {
  const list = frame(container);
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 400 });
  list.getBoundingClientRect = () => new DOMRect(0, 0, 300, 400);
  cards(container).forEach((card, index) => {
    card.getBoundingClientRect = () => new DOMRect(0, index * 100 - list.scrollTop, 300, 100);
  });
}

describe('HeroPreview', () => {
  it('AC-L13 server-renders every embedded story of All inside one scrolling frame', () => {
    const container = document.createElement('div');
    container.innerHTML = staticMarkup();
    expect(STORIES).toHaveLength(30);
    expect(frame(container).querySelectorAll('article[data-story-id]')).toHaveLength(30);
    expect(frame(container).className).toContain('overflow-y-auto');
    expect(body(container).className).toMatch(/(^| )h-\[[\d.]+rem\]/);
    expect(container.textContent).toContain('Showing 30 of 300 stories today');
  });

  it('AC-L13 keeps the same fixed-height body for a chip, an empty chip and the Briefing view', async () => {
    const withoutRust = STORIES.filter((story) => !story.tags.includes('rust'));
    const container = mount({ stories: withoutRust });
    const fixedHeight = body(container).className;

    act(() => button(container, 'React').click());
    expect(body(container).className).toBe(fixedHeight);
    expect(cards(container).length).toBeGreaterThan(0);

    act(() => button(container, 'Rust').click());
    expect(cards(container)).toHaveLength(0);
    expect(container.textContent).toContain('No stories with this tag in the last 24 hours.');
    expect(body(container).className).toBe(fixedHeight);

    await showBriefing(container);
    expect(body(container).className).toBe(fixedHeight);
    expect(body(container).querySelector('[role="region"]')!.className).toContain(
      'overflow-y-auto',
    );
  });

  it('AC-L13 lets the cards past the frame fold skip rendering until scrolled near', () => {
    const container = document.createElement('div');
    container.innerHTML = staticMarkup();
    const wrappers = [...frame(container).children];
    expect(wrappers[0]!.className).not.toContain('content-visibility');
    expect(wrappers[29]!.className).toContain('[content-visibility:auto]');
    expect(wrappers[29]!.className).toContain('[contain-intrinsic-size:');
  });

  it('AC-L5 links each card title to its story page in the same tab', () => {
    const container = document.createElement('div');
    container.innerHTML = staticMarkup();
    const [first] = STORIES;
    const title = [...container.querySelectorAll('a')].find(
      (link) => link.textContent === first!.title,
    )!;
    expect(title.getAttribute('href')).toBe(`/story/${first!.id}`);
    expect(title.hasAttribute('target')).toBe(false);
  });

  it('AC-L5 j three times then Enter opens the fourth card’s story page', () => {
    const container = mount();
    stubLayout(container);
    act(() => previewWindow(container).focus());
    press(container, 'j');
    press(container, 'j');
    press(container, 'j');
    expect(cards(container)[3]!.dataset.active).toBe('true');
    press(container, 'Enter');
    expect(router.push).toHaveBeenCalledWith(`/story/${STORIES[3]!.id}`);
  });

  it('AC-L13 j and k scroll the frame to the active card, never the page', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const container = mount();
    stubLayout(container);
    act(() => previewWindow(container).focus());
    for (let step = 0; step < 5; step++) press(container, 'j');
    // Card 5 spans 500–600 px, so the 400 px frame scrolls to 200 to show all of it.
    expect(frame(container).scrollTop).toBe(200);
    press(container, 'k');
    press(container, 'k');
    press(container, 'k');
    // Card 2 starts at 200 px, still the frame's top: no scroll needed.
    expect(frame(container).scrollTop).toBe(200);
    press(container, 'k');
    expect(frame(container).scrollTop).toBe(100);
    expect(scrollIntoView).not.toHaveBeenCalled();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('AC-L14 shows a cluster card’s combined source line and a static "+N related" link while clustering is on', () => {
    features.clusters = true;
    const container = document.createElement('div');
    container.innerHTML = staticMarkup();
    const card = container.querySelector(`article[data-story-id="${CLUSTER_CARD.id}"]`)!;
    expect(card.textContent).toContain(
      'Trending on HN (▲ 455 points) & Dev.to (♥ 140 reactions) · GitHub (★ 104k stars)',
    );
    const related = [...card.querySelectorAll('a')].find((link) =>
      /\+\d+ related/.test(link.textContent ?? ''),
    )!;
    expect(related.textContent).toBe(`+${CLUSTER_CARD.cluster!.memberCount - 1} related`);
    expect(related.getAttribute('href')).toBe(`/story/${CLUSTER_CARD.id}`);
    expect(card.querySelector('[aria-expanded]')).toBeNull();
    expect(card.querySelector('button:not([aria-label="Save story"])')).toBeNull();
  });

  it('AC-L14 shows the per-source badges and no "+N related" while clustering is off', () => {
    const container = document.createElement('div');
    container.innerHTML = staticMarkup();
    const card = container.querySelector(`article[data-story-id="${CLUSTER_CARD.id}"]`)!;
    expect(card.textContent).not.toContain('Trending on');
    expect(card.textContent).not.toContain('related');
    expect(card.querySelector('[data-source-kind="hn"]')).not.toBeNull();
  });

  it('AC-2.3.9 shows the summary line on a preview card while summaries are on', () => {
    features.summaries = true;
    const container = document.createElement('div');
    container.innerHTML = staticMarkup();
    const card = container.querySelector(`article[data-story-id="${CLUSTER_CARD.id}"]`)!;
    expect(card.textContent).toContain(CLUSTER_CARD.summaryLine!);
  });

  it('AC-L7 has no Feed | Briefing switch without a briefing (copilot flag off)', () => {
    const html = staticMarkup();
    expect(html).not.toContain('Briefing');
    expect(html).not.toContain('Preview view');
  });

  it('AC-L7 shows the switch with Feed pressed and no renderer on first render (copilot flag on)', () => {
    const container = mount();
    expect(button(container, 'Feed').getAttribute('aria-pressed')).toBe('true');
    expect(button(container, 'Briefing').getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-testid="renderer"]')).toBeNull();
    expect(container.querySelector('article[data-story-id]')).not.toBeNull();
  });

  it('AC-3.2.2 the Briefing control renders example #1 and Feed returns to the stories', async () => {
    const container = mount();
    await showBriefing(container);
    expect(container.querySelector('[data-testid="renderer"]')).not.toBeNull();
    expect(container.querySelector('article[data-story-id]')).toBeNull();
    expect(container.querySelector(`[aria-label="${BRIEFING!.question}"]`)).not.toBeNull();
    act(() => button(container, 'Feed').click());
    expect(container.querySelector('[data-testid="renderer"]')).toBeNull();
    expect(container.querySelector('article[data-story-id]')).not.toBeNull();
  });

  it('AC-3.2.2 the Briefing view drops the feed-only shortcuts and the story count', async () => {
    const container = mount();
    expect(previewWindow(container).getAttribute('aria-keyshortcuts')).toBe('J K S Enter');
    expect(container.textContent).toContain('Showing 30 of 300 stories today');
    await showBriefing(container);
    expect(previewWindow(container).hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(container.textContent).not.toContain('Showing');
  });

  it('AC-L2 announces a sample briefing through a live region', async () => {
    const container = mount({ briefingIsSample: true });
    const status = container.querySelector('[role="status"]')!;
    expect(status.textContent).toBe('');
    await showBriefing(container);
    expect(status.textContent).toBe('Sample data');
  });

  it('AC-L2 labels a sample briefing in the window', async () => {
    const container = mount({ briefingIsSample: true });
    expect(container.textContent).not.toContain('Sample data');
    await showBriefing(container);
    expect(container.textContent).toContain('Sample data');
  });
});
