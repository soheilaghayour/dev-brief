// @vitest-environment jsdom
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/content/landing-fixture.json';
import { HeroPreview } from './HeroPreview';
import { sampleExampleBriefings } from './exampleBriefingData';
import { fixtureStories, type FixtureStory } from './landingStories';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./usePreviewSaves', () => ({
  usePreviewSaves: () => ({ isReady: true, isSaved: () => false, toggle: vi.fn() }),
}));
vi.mock('@/features/copilot/LazyBriefingView', () => ({
  LazyBriefingView: () => <div data-testid="renderer" />,
}));

const STORIES = fixtureStories(fixture.items as FixtureStory[], new Date());
const [BRIEFING] = sampleExampleBriefings();

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

function mount(briefingIsSample = false) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <HeroPreview
        stories={STORIES}
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

const button = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === name)!;

describe('HeroPreview', () => {
  it('AC-L7 has no Feed | Briefing switch without a briefing (copilot flag off)', () => {
    const html = renderToStaticMarkup(
      <HeroPreview stories={STORIES} storiesToday={300} isSample={false} host="devbrief.dev" />,
    );
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

  it('AC-3.2.2 the Briefing control renders example #1 and Feed returns to the stories', () => {
    const container = mount();
    act(() => button(container, 'Briefing').click());
    expect(container.querySelector('[data-testid="renderer"]')).not.toBeNull();
    expect(container.querySelector('article[data-story-id]')).toBeNull();
    expect(container.querySelector(`[aria-label="${BRIEFING!.question}"]`)).not.toBeNull();
    act(() => button(container, 'Feed').click());
    expect(container.querySelector('[data-testid="renderer"]')).toBeNull();
    expect(container.querySelector('article[data-story-id]')).not.toBeNull();
  });

  it('AC-L2 labels a sample briefing in the window', () => {
    const container = mount(true);
    expect(container.textContent).not.toContain('Sample data');
    act(() => button(container, 'Briefing').click());
    expect(container.textContent).toContain('Sample data');
  });
});
