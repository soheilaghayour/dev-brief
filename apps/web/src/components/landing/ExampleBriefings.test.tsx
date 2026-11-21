// @vitest-environment jsdom
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLE_QUESTIONS } from '@devbrief/shared';
import { ExampleBriefings } from './ExampleBriefings';
import { sampleExampleBriefings } from './exampleBriefingData';
import { nextTabIndex, storedBriefingSource } from './storedBriefing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The renderer stays out of this test: the stub shows that it got a stored source.
vi.mock('@/features/copilot/LazyBriefingView', () => ({
  LazyBriefingView: ({ source }: { source: { subscribe: unknown } }) => (
    <div data-testid="renderer" data-has-source={typeof source.subscribe === 'function'} />
  ),
}));

const EXAMPLES = EXAMPLE_QUESTIONS.map((example) => ({
  ...example,
  messages: sampleExampleBriefings()[0]!.messages,
}));

let observed: { callback: IntersectionObserverCallback } | undefined;
let root: Root | undefined;

beforeEach(() => {
  observed = undefined;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observed = { callback };
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function mount(isSample = false) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<ExampleBriefings examples={EXAMPLES} isSample={isSample} />));
  return container;
}

// Load the lazy chunk up front so tests wait on the tabs appearing, not on a cold import.
beforeAll(() => import('./ExampleBriefingTabs'));

// The live tabs are a lazy chunk: only they give their tabs an id, so that marks their arrival.
async function scrollIntoView(container: HTMLElement) {
  act(() =>
    observed!.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
  await vi.waitFor(
    async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(container.querySelector('[role="tab"][id]')).not.toBeNull();
    },
    { timeout: 5000 },
  );
}

describe('ExampleBriefings', () => {
  it('AC-3.2.2 server-renders the heading, all three question tabs and a skeleton, without the renderer', () => {
    const html = renderToStaticMarkup(<ExampleBriefings examples={EXAMPLES} isSample={false} />);
    for (const { question } of EXAMPLE_QUESTIONS)
      expect(html).toContain(question.replaceAll("'", '&#x27;'));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Preparing your briefing');
    expect(html).not.toContain('data-testid="renderer"');
    expect(html).not.toContain('Sample data');
  });

  it('AC-L7 renders nothing without examples, which is what the loader yields while the copilot flag is off', () => {
    expect(renderToStaticMarkup(<ExampleBriefings examples={[]} isSample={false} />)).toBe('');
  });

  it('AC-L2 labels a sample briefing', () => {
    expect(
      renderToStaticMarkup(<ExampleBriefings examples={EXAMPLES} isSample={true} />),
    ).toContain('Sample data');
  });

  it('AC-3.2.2 loads the live tabs and the renderer only once the section nears the viewport', async () => {
    const container = mount();
    expect(container.querySelector('[data-testid="renderer"]')).toBeNull();
    await scrollIntoView(container);
    expect(
      container.querySelector('[data-testid="renderer"]')?.getAttribute('data-has-source'),
    ).toBe('true');
  });

  it('AC-3.2.2 switches the briefing with a click and exposes tab roles', async () => {
    const container = mount();
    await scrollIntoView(container);
    const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    act(() => tabs[1]!.click());
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.tabIndex).toBe(0);
    expect(tabs[0]?.tabIndex).toBe(-1);
    const panel = container.querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute('aria-labelledby')).toBe(tabs[1]?.id);
  });

  it('AC-3.2.2 moves between tabs with the arrow keys and focuses the new tab', async () => {
    const container = mount();
    await scrollIntoView(container);
    const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
    act(() => {
      tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[1]);
  });
});

describe('ExampleBriefings before the live tabs arrive', () => {
  it('AC-3.2.2 carries the focused tab and an arrowed-to tab over to the live tabs', async () => {
    const container = mount();
    const staticTabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
    act(() => {
      staticTabs[0]!.focus();
      staticTabs[0]!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });

    await vi.waitFor(
      async () => {
        await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
        expect(container.querySelector('[role="tab"][id]')).not.toBeNull();
      },
      { timeout: 5000 },
    );
    const liveTabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
    expect(liveTabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(liveTabs[1]);
  });

  it('AC-L2 ties the sample label to the tabpanel', async () => {
    const container = mount(true);
    const labelId = container.querySelector('span[id]')?.id;
    expect(container.querySelector('[role="tabpanel"]')?.getAttribute('aria-describedby')).toBe(
      labelId,
    );
    await scrollIntoView(container);
    expect(container.querySelector('[role="tabpanel"]')?.getAttribute('aria-describedby')).toBe(
      labelId,
    );
  });
});

describe('nextTabIndex', () => {
  it('wraps the arrows, jumps with Home and End, and ignores other keys', () => {
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextTabIndex('Home', 2, 3)).toBe(0);
    expect(nextTabIndex('End', 0, 3)).toBe(2);
    expect(nextTabIndex('a', 0, 3)).toBeUndefined();
  });
});

describe('storedBriefingSource', () => {
  it('AC-3.2.2 replays every stored message on subscribe', () => {
    const push = vi.fn();
    storedBriefingSource([1, 2, 3]).subscribe(push);
    expect(push.mock.calls.map(([message]) => message)).toEqual([1, 2, 3]);
  });
});
