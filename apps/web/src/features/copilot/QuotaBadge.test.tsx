// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { QuotaBadge } from './QuotaBadge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(quota: Parameters<typeof QuotaBadge>[0]['quota']) {
  const container = document.createElement('div');
  act(() => createRoot(container).render(<QuotaBadge quota={quota} />));
  return container;
}

const RESETS_AT = '2026-11-22T00:00:00.000Z';

describe('QuotaBadge', () => {
  it('AC-3.1.4 reads "2/3 left"', () => {
    expect(render({ limit: 3, remaining: 2, resetsAt: RESETS_AT }).textContent).toBe('2/3 left');
  });

  it('AC-3.1.4 reads "0/3 left" for a used-up quota', () => {
    expect(render({ limit: 3, remaining: 0, resetsAt: RESETS_AT }).textContent).toBe('0/3 left');
  });

  it('renders nothing until the quota is known', () => {
    expect(render(null).textContent).toBe('');
  });
});
