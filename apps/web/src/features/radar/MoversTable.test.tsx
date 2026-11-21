// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Radar, TagSlug } from '@devbrief/shared';
import { MoversTable } from './MoversTable';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MOVERS = [
  { tag: 'ai-llms', label: 'AI/LLMs', current: 312, previous: 260, deltaPct: 20 },
  { tag: 'rust', label: 'Rust', current: 44, previous: 29, deltaPct: 52 },
  { tag: 'vue', label: 'Vue', current: 18, previous: 25, deltaPct: -28 },
  { tag: 'go', label: 'Go', current: 9, previous: 0, deltaPct: null },
  { tag: 'react', label: 'React', current: 50, previous: 50, deltaPct: 0 },
  { tag: 'typescript', label: 'TypeScript', current: 70, previous: 60, deltaPct: 17 },
] as const satisfies Radar['movers'];

let container: HTMLDivElement;
afterEach(() => container.remove());

async function renderTable(selected: TagSlug[], onToggleTag = vi.fn()) {
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(
      <MoversTable movers={MOVERS} selected={selected} onToggleTag={onToggleTag} />,
    );
  });
  return onToggleTag;
}

const checkbox = (label: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="Show ${label} in chart"]`);

describe('MoversTable', () => {
  it('AC-3.3.1 lists tag, now, prev and delta with a link to the filtered feed', async () => {
    await renderTable(['ai-llms']);
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(6);
    expect(rows[0]?.querySelector('a')?.getAttribute('href')).toBe('/feed?tags=ai-llms');
    expect(rows[0]?.textContent).toContain('312');
    expect(rows[0]?.textContent).toContain('260');
  });

  it('AC-3.3.1 the delta has an icon and text, and a null delta reads "new"', async () => {
    await renderTable(['ai-llms']);
    const cells = [...container.querySelectorAll('tbody tr')].map(
      (row) => row.querySelectorAll('td')[3]?.textContent,
    );
    expect(cells).toEqual(['▲+20%', '▲+52%', '▼−28%', '▲new', '0%', '▲+17%']);
  });

  it('AC-3.3.1 the sixth checkbox is disabled once five tags are charted', async () => {
    await renderTable(['ai-llms', 'rust', 'vue', 'go', 'react']);
    expect(checkbox('TypeScript')?.disabled).toBe(true);
    expect(checkbox('Rust')?.disabled).toBe(false);
    expect(container.textContent).toContain('at most 5 tags');
  });

  it('AC-3.3.1 a checkbox reports its tag', async () => {
    const onToggleTag = await renderTable(['ai-llms', 'rust']);
    await act(async () => checkbox('Vue')?.click());
    expect(onToggleTag).toHaveBeenCalledWith('vue');
  });

  it('keeps the last charted tag on', async () => {
    await renderTable(['rust']);
    expect(checkbox('Rust')?.disabled).toBe(true);
  });
});
