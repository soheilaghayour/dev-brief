// Shared by the collections component tests (jsdom): mounts a tree over the real guest store and drives it like a user.
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GuestCollection } from '@/lib/guest/collectionsState';
import { useGuestStore } from '@/lib/guest/guestStore';
import { hydrateGuestStore } from '@/lib/guest/hydrateGuestStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Radix measures with ResizeObserver, which jsdom lacks. */
export class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** A story id that passes the contract's id rule. */
export function storyId(n: number) {
  return `c${String(n).padStart(24, '0')}`;
}

export function collection(
  id: string,
  name: string,
  position: number,
  storyIds: string[] = [],
): GuestCollection {
  return {
    id,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    name,
    description: null,
    position,
    items: storyIds.map((storyId, index) => ({
      storyId,
      position: index,
      addedAt: '2026-05-01T10:00:00.000Z',
    })),
  };
}

/** Loads the store and replaces its saves and collections. */
export async function seedGuestStore(collections: GuestCollection[], saves: string[] = []) {
  await hydrateGuestStore();
  await act(async () => {
    useGuestStore.setState({
      collections,
      saves: saves.map((storyId) => ({ storyId, savedAt: '2026-05-01T10:00:00.000Z' })),
    });
  });
}

export async function mount(ui: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export async function click(element: Element | null | undefined) {
  if (!element) throw new Error('Nothing to click');
  await act(async () => {
    (element as HTMLElement).click();
  });
}

/** Loads the lazily imported modules up front, so a test waits for outcomes and not for chunk loads. */
export async function preloadLazyModules() {
  await Promise.all([
    import('@/lib/guest/guestCollections'),
    import('./AddToCollectionDialog'),
    import('./CollectionDialogs'),
    import('./CollectionMenuDropdown'),
    import('./collectionNotice'),
  ]);
}

export async function typeInto(input: HTMLInputElement, text: string) {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Radix opens a menu on pointerdown or on Enter; Enter is the keyboard path. */
export async function openMenuByKeyboard(trigger: Element | null) {
  if (!trigger) throw new Error('No menu button');
  await pressKey(trigger, 'Enter');
}

export async function pressKey(target: Element | Document, key: string) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
  });
}

export function byRole(selector: string, name: string) {
  return (
    [...document.querySelectorAll<HTMLElement>(selector)].find(
      (element) =>
        element.getAttribute('aria-label') === name || element.textContent?.trim() === name,
    ) ?? null
  );
}
