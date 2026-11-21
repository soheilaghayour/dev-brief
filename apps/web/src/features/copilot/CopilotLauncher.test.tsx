// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HotkeysProvider, useShortcutsHelp } from '@/lib/hotkeys/HotkeysProvider';
import { CopilotLauncher } from './CopilotLauncher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const loads = vi.hoisted(() => ({ count: 0 }));

// Counts how often the bar's module is evaluated: it must not be before the first open.
vi.mock('./CopilotCommandBar', async (importOriginal) => {
  loads.count += 1;
  return importOriginal();
});
vi.mock('@/lib/api/endpoints', () => ({
  getCopilotQuota: async () => ({ limit: 3, remaining: 3, resetsAt: '2026-11-22T00:00:00.000Z' }),
}));
vi.mock('@/lib/guest/loadDeviceId', () => ({
  loadDeviceId: async () => '0b9f8a4e-5a56-4c1d-9c51-3b0f2f6d9c11',
}));
vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: null }) }));
vi.mock('next/link', () => ({ default: 'a' }));

/** Opens the help dialog once it is mounted, standing in for pressing `?`. */
function HelpOpener({ shouldOpen }: { shouldOpen: boolean }) {
  const { setOpen } = useShortcutsHelp();
  useEffect(() => {
    if (shouldOpen) setOpen(true);
  }, [shouldOpen, setOpen]);
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function renderTree(helpOpen: boolean) {
  await act(async () =>
    root.render(
      <HotkeysProvider>
        <input aria-label="Search stories" />
        <CopilotLauncher />
        <HelpOpener shouldOpen={helpOpen} />
      </HotkeysProvider>,
    ),
  );
}

beforeEach(async () => {
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
  await renderTree(false);
  // The bindings load after hydration; keys pressed earlier would be lost.
  await vi.waitFor(() => expect(document.documentElement.dataset.hotkeysReady).toBeDefined());
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const searchInput = () =>
  document.querySelector<HTMLInputElement>('input[aria-label="Search stories"]')!;
const bar = () => document.querySelector('[role="dialog"]');
const askButton = () =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Ask'))!;

async function press(key: string, init: KeyboardEventInit, target: EventTarget = document) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

async function whenBarIsOpen() {
  await vi.waitFor(() => expect(bar()).not.toBeNull());
}

describe('CopilotLauncher', () => {
  it('AC-3.1.1 loads nothing of the bar before the first open', () => {
    expect(loads.count).toBe(0);
    expect(bar()).toBeNull();
  });

  it('AC-3.1.1 Ctrl+K opens the bar from inside a focused search input', async () => {
    searchInput().focus();

    await press('k', { ctrlKey: true }, searchInput());
    await whenBarIsOpen();

    expect(bar()?.textContent).toContain('Ask the News');
    expect(loads.count).toBe(1);
  });

  it('keeps the browser from also running its own Ctrl+K', async () => {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    await act(async () => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it('opens from the header button for mouse and touch users', async () => {
    await act(async () => askButton().click());
    await whenBarIsOpen();

    expect(bar()?.textContent).toContain('Ask the News');
  });

  it('returns focus to the field the shortcut was pressed in when the bar closes', async () => {
    searchInput().focus();
    await press('k', { ctrlKey: true }, searchInput());
    await whenBarIsOpen();

    await press('Escape', {}, document.activeElement ?? document);
    await vi.waitFor(() => expect(bar()).toBeNull());

    // Radix hands focus back a tick after the content unmounts.
    await vi.waitFor(() => expect(document.activeElement).toBe(searchInput()));
  });

  it('returns focus to the header button when the bar opened from it closes', async () => {
    askButton().focus();
    await act(async () => askButton().click());
    await whenBarIsOpen();

    await press('Escape', {}, document.activeElement ?? document);
    await vi.waitFor(() => expect(bar()).toBeNull());

    await vi.waitFor(() => expect(document.activeElement).toBe(askButton()));
  });

  it('traps focus inside the open bar', async () => {
    await act(async () => askButton().click());
    await whenBarIsOpen();

    const focusable = [
      ...bar()!.querySelectorAll<HTMLElement>('input, button:not([disabled]), a[href]'),
    ];
    focusable.at(-1)!.focus();
    await press('Tab', {}, document.activeElement ?? document);

    expect(bar()!.contains(document.activeElement)).toBe(true);
  });

  it('lists the shortcut in the help dialog', async () => {
    await renderTree(true);

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Open the Ask the News command bar'),
    );
  });
});
