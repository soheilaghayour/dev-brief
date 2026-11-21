// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { NuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RadarControls } from './RadarControls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
afterEach(() => container.remove());

async function renderControls(searchParams: string) {
  const updates: UrlUpdateEvent[] = [];
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(
      <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={(event) => updates.push(event)}>
        <RadarControls />
      </NuqsTestingAdapter>,
    );
  });
  return updates;
}

function button(name: string) {
  const found = [...container.querySelectorAll('button')].find((b) => b.textContent === name);
  if (!found) throw new Error(`No button ${name}`);
  return found;
}

describe('RadarControls', () => {
  it('AC-3.3.1 the window toggle writes the URL and omits the default', async () => {
    const updates = await renderControls('');
    expect(button('7d').getAttribute('aria-pressed')).toBe('true');

    await act(async () => button('30d').click());
    // nuqs queues and throttles URL writes, so wait for the flush, not the click.
    await vi.waitFor(() => expect(updates.at(-1)?.queryString).toBe('?window=30d'));
    expect(updates.at(-1)?.options.history).toBe('replace');
    expect(button('30d').getAttribute('aria-pressed')).toBe('true');

    await act(async () => button('7d').click());
    await vi.waitFor(() => expect(updates.at(-1)?.queryString).toBe(''));
  });

  it('AC-3.3.1 the metric toggle writes the URL and keeps the other params', async () => {
    const updates = await renderControls('?window=30d&tags=rust');
    expect(button('Stories').getAttribute('aria-pressed')).toBe('true');

    await act(async () => button('Engagement').click());
    await vi.waitFor(() => expect(updates.at(-1)?.queryString).toContain('metric=engagement'));
    const params = new URLSearchParams(updates.at(-1)?.queryString);
    expect(params.get('window')).toBe('30d');
    expect(params.get('tags')).toBe('rust');
  });
});
