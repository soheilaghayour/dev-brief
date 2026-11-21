// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HotkeysProvider } from '@/lib/hotkeys/HotkeysProvider';
import { GoToShortcuts } from './GoToShortcuts';
import { getGoToTargets, getNavItems } from './navItems';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const flags = vi.hoisted(() => ({ radar: false, collections: true }));
vi.mock('@/config/features', () => ({
  isFeatureEnabled: (name: keyof typeof flags, features?: typeof flags) =>
    (features ?? flags)[name],
}));

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  });
}

// Loaded once up front, so a test waits for its outcome and not for the chunk.
beforeAll(() => import('@/lib/hotkeys/ShortcutBindings'));

let unmount = () => {};
afterEach(() => {
  unmount();
  router.push.mockClear();
  flags.collections = true;
});

async function mount() {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <HotkeysProvider>
        <GoToShortcuts />
      </HotkeysProvider>,
    ),
  );
  unmount = () => act(() => root.unmount());
  await vi.waitFor(() => expect(document.documentElement.dataset.hotkeysReady).toBe(''));
}

describe('g c', () => {
  it('AC-3.4.3 g then c opens /saved, the collections overview, while the flag is on', async () => {
    await mount();
    press('g');
    press('c');
    expect(router.push).toHaveBeenCalledWith('/saved');
  });

  it('binds nothing for c while the flag is off', async () => {
    flags.collections = false;
    await mount();
    press('g');
    press('c');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('AC-3.4.3 lists "Go to Collections" among the targets and adds no sidebar item', () => {
    const targets = getGoToTargets();
    expect(targets.find(({ shortcut }) => shortcut.keys === 'g>c')).toMatchObject({
      href: '/saved',
      shortcut: { description: 'Go to Collections' },
    });
    expect(getNavItems().map(({ href }) => href)).toEqual(['/feed', '/saved']);
  });
});
