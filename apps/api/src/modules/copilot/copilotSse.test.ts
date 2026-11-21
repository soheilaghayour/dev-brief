import { describe, expect, it } from 'vitest';
import { formatSseEvent, type CopilotSseEvent } from './copilotSse.js';

describe('formatSseEvent', () => {
  it('writes the event name and its JSON payload as one SSE block', () => {
    expect(formatSseEvent({ event: 'done', data: {} })).toBe('event: done\ndata: {}\n\n');
  });

  it('throws on a payload that fails its schema, so nothing invalid is written', () => {
    const invalidMeta = { event: 'meta', data: { queryId: 7 } } as unknown as CopilotSseEvent;
    const invalidError = { event: 'error', data: { code: 'NOPE' } } as unknown as CopilotSseEvent;

    expect(() => formatSseEvent(invalidMeta)).toThrow();
    expect(() => formatSseEvent(invalidError)).toThrow();
  });
});
