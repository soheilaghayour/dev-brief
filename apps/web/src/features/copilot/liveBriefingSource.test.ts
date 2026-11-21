import { describe, expect, it, vi } from 'vitest';
import { createLiveSource } from './liveBriefingSource';

describe('createLiveSource', () => {
  it('replays what arrived before the view subscribed, then pushes new messages', () => {
    const live = createLiveSource();
    live.push('first');
    const received = vi.fn();

    live.source.subscribe(received);
    live.push('second');

    expect(received.mock.calls).toEqual([['first'], ['second']]);
  });

  it('stops pushing after unsubscribe', () => {
    const live = createLiveSource();
    const received = vi.fn();
    const unsubscribe = live.source.subscribe(received);

    unsubscribe();
    live.push('late');

    expect(received).not.toHaveBeenCalled();
  });
});
