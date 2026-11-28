// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
  await act(async () => root.render(<CopilotLauncher />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const bar = () => document.querySelector('[role="dialog"]');
const askButton = () =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === 'Ask')!;

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
  // The bar's module loads on first open, which is slow while the machine is busy.
  await vi.waitFor(() => expect(bar()).not.toBeNull(), { timeout: 5000 });
}

describe('CopilotLauncher', () => {
  it('AC-3.1.1 loads nothing of the bar before the first open', () => {
    expect(loads.count).toBe(0);
    expect(bar()).toBeNull();
  });

  it('AC-3.1.1 the Ask button opens the bar', async () => {
    await act(async () => askButton().click());
    await whenBarIsOpen();

    expect(bar()?.textContent).toContain('Ask the News');
  });

  it('AC-3.1.1 Esc closes the bar and returns focus to the Ask button', async () => {
    askButton().focus();
    await act(async () => askButton().click());
    await whenBarIsOpen();

    await press('Escape', {}, document.activeElement ?? document);
    await vi.waitFor(() => expect(bar()).toBeNull());

    await vi.waitFor(() => expect(document.activeElement).toBe(askButton()));
  });

  it('opens a fresh bar each time, with the question cleared', async () => {
    await act(async () => askButton().click());
    await whenBarIsOpen();
    const question = () =>
      document.querySelector<HTMLInputElement>('input[aria-label="Your question"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        question(),
        'Is Bun ready?',
      );
      question().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await press('Escape', {}, document.activeElement ?? document);
    await vi.waitFor(() => expect(bar()).toBeNull());

    await act(async () => askButton().click());
    await whenBarIsOpen();

    expect(question().value).toBe('');
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

  it('AC-3.1.1 Ctrl+K and ⌘K do nothing', async () => {
    await press('k', { ctrlKey: true });
    await press('k', { metaKey: true });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(bar()).toBeNull();
  });
});
