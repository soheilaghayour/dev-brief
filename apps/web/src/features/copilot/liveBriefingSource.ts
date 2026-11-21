import type { BriefingSource } from './BriefingView';

/** A source fed by a running stream; a view that subscribes late still gets every message so far. */
export function createLiveSource() {
  const received: unknown[] = [];
  const listeners = new Set<(message: unknown) => void>();
  const source: BriefingSource = {
    subscribe: (push) => {
      received.forEach((message) => push(message));
      listeners.add(push);
      return () => listeners.delete(push);
    },
  };
  function push(message: unknown) {
    received.push(message);
    listeners.forEach((listener) => listener(message));
  }
  return { source, push };
}
