// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusAfterRemoval } from './useFocusAfterRemoval';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const moveTo = vi.fn();

function List({ ids }: { ids: string[] }) {
  const trackFocus = useFocusAfterRemoval(
    ids.map((id) => ({ id })),
    moveTo,
  );
  return (
    <div onFocusCapture={trackFocus}>
      {ids.map((id) => (
        <article key={id} data-story-id={id}>
          <a href={`#${id}`}>{id}</a>
        </article>
      ))}
      <input aria-label="search" />
    </div>
  );
}

let unmount = () => {};

function render(ids: string[]) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<List ids={ids} />));
  unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  return (nextIds: string[]) => act(() => root.render(<List ids={nextIds} />));
}

afterEach(() => {
  unmount();
  moveTo.mockClear();
});

describe('useFocusAfterRemoval', () => {
  it('AC-2.5.2 moves focus to the next story when the focused one is muted away', () => {
    const rerender = render(['a', 'b', 'c']);
    act(() => document.querySelector<HTMLElement>('[data-story-id="b"] a')?.focus());

    rerender(['a', 'c']);

    expect(document.activeElement).toBe(document.body);
    expect(moveTo).toHaveBeenCalledExactlyOnceWith('c');
  });

  it('AC-2.5.2 falls back to the story before when the last one went', () => {
    const rerender = render(['a', 'b']);
    act(() => document.querySelector<HTMLElement>('[data-story-id="b"] a')?.focus());
    rerender(['a']);
    expect(moveTo).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('leaves focus alone when it is somewhere else or the focused story stays', () => {
    const rerender = render(['a', 'b', 'c']);
    act(() => document.querySelector<HTMLElement>('[data-story-id="b"] a')?.focus());
    rerender(['a', 'b']);
    act(() => document.querySelector<HTMLElement>('input')?.focus());
    rerender(['a']);
    expect(moveTo).not.toHaveBeenCalled();
  });
});
