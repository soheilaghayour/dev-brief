// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { StreamErrorNotice } from './StreamErrorNotice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('StreamErrorNotice', () => {
  it('AC-3.1.8 shows the message as an alert and re-asks on Try again', () => {
    const onRetry = vi.fn();
    const container = document.createElement('div');
    act(() =>
      createRoot(container).render(
        <StreamErrorNotice message="Couldn't finish this briefing." onRetry={onRetry} />,
      ),
    );

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't finish this briefing.",
    );
    act(() => container.querySelector('button')!.click());

    expect(container.querySelector('button')?.textContent).toBe('Try again');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
