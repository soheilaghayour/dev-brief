// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HotkeysProvider, useShortcut } from './HotkeysProvider';
import type { Shortcut } from './shortcutRules';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAVE = { id: 'save', keys: 's', description: 'Save', scope: 'Test' } satisfies Shortcut;
const GO_TO_SAVED = {
  id: 'go-saved',
  keys: 'g>s',
  description: 'Go to Saved',
  scope: 'Test',
} satisfies Shortcut;

function Probe({ onSave, onGoToSaved }: { onSave: () => void; onGoToSaved: () => void }) {
  useShortcut(SAVE, onSave);
  useShortcut(GO_TO_SAVED, onGoToSaved);
  return null;
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  });
}

let unmount = () => {};
afterEach(() => unmount());

async function mount() {
  const onSave = vi.fn();
  const onGoToSaved = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <HotkeysProvider>
        <Probe onSave={onSave} onGoToSaved={onGoToSaved} />
      </HotkeysProvider>,
    ),
  );
  unmount = () => act(() => root.unmount());
  // The key bindings load lazily, after the first render.
  await act(async () => {
    await import('./ShortcutBindings');
  });
  await vi.waitFor(() => expect(document.documentElement.dataset.hotkeysReady).toBe(''));
  return { onSave, onGoToSaved };
}

describe('HotkeysProvider', () => {
  it('AC-1.3.8 a single key typed after a sequence leader does not run the plain handler', async () => {
    const { onSave, onGoToSaved } = await mount();
    press('g');
    press('s');
    expect(onGoToSaved).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('AC-1.3.8 the plain handler still runs when no leader came first', async () => {
    const { onSave, onGoToSaved } = await mount();
    press('s');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onGoToSaved).not.toHaveBeenCalled();
  });
});
