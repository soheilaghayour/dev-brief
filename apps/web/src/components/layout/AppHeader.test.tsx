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

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
      );
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('Keyboard shortcuts'));

    expect(document.body.textContent).not.toContain('Ask the News');
  });

  it('flag on: the header carries the Ask button', () => {
    const html = renderToStaticMarkup(
      <HotkeysProvider>
        <AppHeader features={on} />
      </HotkeysProvider>,
    );

    expect(html).toContain('aria-keyshortcuts="Control+K Meta+K"');
  });
});
