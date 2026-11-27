// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { AppearanceSection } from './AppearanceSection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderSection() {
  const container = document.body.appendChild(document.createElement('div'));
  await act(async () =>
    createRoot(container).render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ThemeToggle />
        <AppearanceSection />
      </ThemeProvider>,
    ),
  );
  return container;
}

const option = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLElement>(`[role="radio"][aria-label="${name}"]`);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('AppearanceSection', () => {
  it('AC-1.6.1 offers System, Light and Dark, with System selected when nothing is stored', async () => {
    const container = await renderSection();

    expect([...container.querySelectorAll('[role="radio"]')].map((o) => o.ariaLabel)).toEqual([
      'System',
      'Light',
      'Dark',
    ]);
    expect(option(container, 'System')?.getAttribute('aria-checked')).toBe('true');
  });

  it('AC-1.6.1 shows the stored choice as selected', async () => {
    localStorage.setItem('theme', 'dark');
    const container = await renderSection();

    expect(option(container, 'Dark')?.getAttribute('aria-checked')).toBe('true');
    expect(option(container, 'System')?.getAttribute('aria-checked')).toBe('false');
  });

  it('AC-1.6.1 choosing System clears the explicit choice', async () => {
    localStorage.setItem('theme', 'dark');
    const container = await renderSection();

    await act(async () => option(container, 'System')?.click());

    expect(localStorage.getItem('theme')).toBe('system');
    expect(option(container, 'System')?.getAttribute('aria-checked')).toBe('true');
  });

  it('AC-1.6.5 a header click under System moves the Settings selection to the explicit theme', async () => {
    const container = await renderSection();

    await act(async () =>
      container.querySelector<HTMLElement>('button:not([role="radio"])')?.click(),
    );

    expect(option(container, 'Light')?.getAttribute('aria-checked')).toBe('false');
    expect(option(container, 'Dark')?.getAttribute('aria-checked')).toBe('true');
    expect(option(container, 'System')?.getAttribute('aria-checked')).toBe('false');
  });
});
