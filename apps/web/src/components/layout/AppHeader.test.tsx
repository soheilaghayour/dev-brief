// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FEATURES } from '@/config/features';
import { HotkeysProvider, useShortcutsHelp } from '@/lib/hotkeys/HotkeysProvider';
import { AppHeader } from './AppHeader';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({ usePathname: () => '/feed' }));

const loads = vi.hoisted(() => ({ count: 0 }));

// Counts how often the launcher's chunk is evaluated: with the flag off it never is.
vi.mock('@/features/copilot/CopilotLauncher', async (importOriginal) => {
  loads.count += 1;
  return importOriginal();
});

function OpenHelp() {
  const { setOpen } = useShortcutsHelp();
  useEffect(() => setOpen(true), [setOpen]);
  return null;
}

const off = { ...FEATURES, copilot: false };
const on = { ...FEATURES, copilot: true };

describe('AppHeader', () => {
  it('flag off: no Ask button in the HTML', () => {
    const html = renderToStaticMarkup(
      <HotkeysProvider>
        <AppHeader features={off} />
      </HotkeysProvider>,
    );

    expect(html).not.toContain('Ask');
    expect(html).not.toContain('Control+K');
  });

  it('AC-1.6.5 has exactly one theme control and no System option', () => {
    const html = renderToStaticMarkup(
      <HotkeysProvider>
        <AppHeader features={off} />
      </HotkeysProvider>,
    );

    expect(html.match(/Switch to dark theme/g)).toHaveLength(1);
    expect(html).not.toContain('role="radio');
    expect(html).not.toContain('System');
  });

  it('flag off: no binding, so Ctrl+K opens nothing, and no help-dialog row', async () => {
    const container = document.body.appendChild(document.createElement('div'));
    await act(async () =>
      createRoot(container).render(
        <HotkeysProvider>
          <AppHeader features={off} />
          <OpenHelp />
        </HotkeysProvider>,
      ),
    );
    await vi.waitFor(() => expect(document.documentElement.dataset.hotkeysReady).toBeDefined());

    const ctrlK = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      document.dispatchEvent(ctrlK);
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('Keyboard shortcuts'));

    // Nothing bound ⌘K (it would have called preventDefault), and the launcher's chunk was never fetched.
    expect(ctrlK.defaultPrevented).toBe(false);
    expect(loads.count).toBe(0);
    expect(container.querySelector('[aria-keyshortcuts]')).toBeNull();
    expect(document.body.textContent).not.toContain('Ask the News');
  });

  it('flag on: the header gets the Ask button once its chunk arrives, and Ctrl+K has a help row', async () => {
    const container = document.body.appendChild(document.createElement('div'));
    await act(async () =>
      createRoot(container).render(
        <HotkeysProvider>
          <AppHeader features={on} />
          <OpenHelp />
        </HotkeysProvider>,
      ),
    );

    await vi.waitFor(() =>
      expect(container.querySelector('button[aria-keyshortcuts="Control+K"]')).not.toBeNull(),
    );
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Open the Ask the News command bar'),
    );
  });
});
