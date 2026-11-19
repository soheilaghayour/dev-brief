// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedEmpty } from './FeedEmpty';
import { FeedError } from './FeedError';
import { FeedSkeleton } from './FeedSkeleton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount = () => {};
afterEach(() => unmount());

function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  return container;
}

describe('FeedSkeleton', () => {
  it('AC-1.3.9 renders fixed-height placeholder rows announced as loading', () => {
    const html = renderToStaticMarkup(<FeedSkeleton />);
    expect(html).toContain('aria-label="Loading stories"');
    expect(html.match(/h-\[76px\]/g)?.length).toBeGreaterThanOrEqual(6);
  });
});

describe('FeedEmpty', () => {
  it('AC-1.3.9 says no stories match and clears the filters on click', () => {
    const onClearFilters = vi.fn();
    const container = mount(<FeedEmpty onClearFilters={onClearFilters} />);
    expect(container.textContent).toContain('No stories match');
    const button = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Clear filters',
    );
    act(() => button?.click());
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('shows no Clear filters button when there is nothing to clear', () => {
    expect(renderToStaticMarkup(<FeedEmpty />)).not.toContain('Clear filters');
  });
});

describe('FeedError', () => {
  it('AC-1.3.9 shows the message inline and retries on click', () => {
    const onRetry = vi.fn();
    const container = mount(<FeedError message="Couldn't load the feed." onRetry={onRetry} />);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't load the feed.",
    );
    act(() => container.querySelector('button')?.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
