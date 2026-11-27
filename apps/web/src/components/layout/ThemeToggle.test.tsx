// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from 'next-themes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stubSystemScheme(scheme: 'light' | 'dark') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: scheme === 'dark' && query.includes('dark'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

async function renderToggle() {
  const container = document.body.appendChild(document.createElement('div'));
  await act(async () =>
    createRoot(container).render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ThemeToggle />
      </ThemeProvider>,
    ),
  );
  const button = container.querySelector('button');
  if (!button) throw new Error('no button');
  return button;
}

async function click(button: HTMLButtonElement) {
  await act(async () => button.click());
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('ThemeToggle', () => {
  it('AC-1.6.5 puts both names and both icons in the HTML, each hidden by the dark class alone', () => {
    const html = renderToStaticMarkup(<ThemeToggle />);
    const container = document.createElement('div');
    container.innerHTML = html;

    const [toDark, toLight] = [...container.querySelectorAll('span')];
    expect(toDark?.textContent).toBe('Switch to dark theme');
    expect(toDark?.classList.contains('dark:hidden')).toBe(true);
    expect(toDark?.classList.contains('hidden')).toBe(false);
    expect(toLight?.textContent).toBe('Switch to light theme');
    expect(toLight?.classList.contains('hidden')).toBe(true);
    expect(toLight?.classList.contains('dark:block')).toBe(true);

    const [sun, moon] = [...container.querySelectorAll('svg')];
    expect(sun?.classList.contains('lucide-sun')).toBe(true);
    expect(sun?.classList.contains('dark:hidden')).toBe(true);
    expect(moon?.classList.contains('lucide-moon')).toBe(true);
    expect(moon?.classList.contains('hidden')).toBe(true);
    expect(moon?.classList.contains('dark:block')).toBe(true);
    expect(container.querySelector('[aria-label]')).toBeNull();
  });

  it('AC-1.6.5 one click in light stores dark and a second stores light', async () => {
    stubSystemScheme('light');
    const button = await renderToggle();

    await click(button);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await click(button);
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('AC-1.6.5 with no stored choice and a dark system, one click stores light, never system', async () => {
    stubSystemScheme('dark');
    const button = await renderToggle();
    expect(localStorage.getItem('theme')).toBeNull();

    await click(button);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
