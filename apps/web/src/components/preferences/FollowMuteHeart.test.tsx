// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { PreferenceMode } from '@/lib/guest/preferences';
import { FollowMuteHeart } from './FollowMuteHeart';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount = () => {};
afterEach(() => unmount());

function Harness({ label }: { label: string }) {
  const [mode, setMode] = useState<PreferenceMode | null>(null);
  return <FollowMuteHeart label={label} mode={mode} onChange={setMode} />;
}

function mount(label: string) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<Harness label={label} />));
  unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  return container.querySelector('button')!;
}

function icon(button: HTMLElement) {
  const svg = button.querySelector('svg')!;
  return {
    shape: svg.classList.contains('lucide-heart-off') ? 'crossed' : 'heart',
    filled: svg.classList.contains('fill-brand'),
  };
}

describe('FollowMuteHeart', () => {
  it.each(['React', 'Hacker News'])(
    'AC-2.5.1 cycles none → followed → muted → none for %s, with an icon and an accessible name per state',
    (label) => {
      const button = mount(label);
      const states: unknown[] = [];
      for (let click = 0; click < 4; click += 1) {
        states.push([button.getAttribute('aria-label'), icon(button)]);
        act(() => button.click());
      }
      expect(states).toEqual([
        [`${label}: not followed. Click to follow.`, { shape: 'heart', filled: false }],
        [`${label}: following. Click to mute.`, { shape: 'heart', filled: true }],
        [`${label}: muted. Click to clear.`, { shape: 'crossed', filled: false }],
        [`${label}: not followed. Click to follow.`, { shape: 'heart', filled: false }],
      ]);
    },
  );

  it('AC-2.5.1 keeps focus on the heart after a click', () => {
    const button = mount('React');
    button.focus();
    act(() => button.click());
    expect(document.activeElement).toBe(button);
  });
});
