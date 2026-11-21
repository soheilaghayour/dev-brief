// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';
import { ApiError } from '@/lib/api/apiError';
import { streamBriefing, type StreamEvent } from './streamBriefing';

const DEVICE_ID = '0b9f8a4e-5a56-4c1d-9c51-3b0f2f6d9c11';
const REQUEST = { question: 'Rust vs Go: what are teams choosing this week?', deviceId: DEVICE_ID };
const QUOTA = { limit: 3, remaining: 2, resetsAt: '2026-11-22T00:00:00.000Z' };
const [SURFACE] = tsToolingBriefing;
const DELETE = { version: '1.0', deleteSurface: { surfaceId: 'briefing-1' } };

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** A response whose body the test feeds chunk by chunk, so it can check events arrive before the stream ends. */
function controlledStream() {
  const cancelled = vi.fn();
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c;
    },
    cancel: cancelled,
  });
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    cancelled,
  };
}

function textResponse(text: string) {
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function collect(events: AsyncGenerator<StreamEvent>) {
  const received: StreamEvent[] = [];
  for await (const event of events) received.push(event);
  return received;
}

describe('streamBriefing', () => {
  it('POSTs the question and device id to the copilot route', async () => {
    const fetchMock = vi.fn(async () => textResponse(sse('done', {})));
    await collect(
      streamBriefing(REQUEST, { signal: new AbortController().signal, fetch: fetchMock }),
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/copilot/ask');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(REQUEST);
  });

  it('parses each event with its shared schema, skipping heartbeats and unknown events', async () => {
    const body =
      ': ping\n\n' +
      sse('meta', { queryId: 'q1', cached: false, quota: QUOTA }) +
      sse('a2ui', SURFACE) +
      sse('future', { anything: true }) +
      sse('done', { usage: { inputTokens: 1, outputTokens: 2, costUsd: 0.001 } });
    const fetchMock = vi.fn(async () => textResponse(body));

    const events = await collect(
      streamBriefing(REQUEST, { signal: new AbortController().signal, fetch: fetchMock }),
    );

    expect(events.map((event) => event.type)).toEqual(['meta', 'a2ui', 'done']);
    expect(events[0]).toMatchObject({ data: { queryId: 'q1', quota: QUOTA } });
  });

  it('yields an event as soon as it arrives, even split across chunks, before the stream ends', async () => {
    const stream = controlledStream();
    const fetchMock = vi.fn(async () => stream.response);
    const iterator = streamBriefing(REQUEST, {
      signal: new AbortController().signal,
      fetch: fetchMock,
    });

    const first = iterator.next();
    const text = sse('meta', { queryId: 'q1', cached: false, quota: QUOTA });
    stream.send(text.slice(0, 20));
    stream.send(text.slice(20));
    expect((await first).value).toMatchObject({ type: 'meta' });

    const second = iterator.next();
    stream.send(sse('a2ui', DELETE));
    expect((await second).value).toMatchObject({ type: 'a2ui' });

    const last = iterator.next();
    stream.close();
    expect((await last).done).toBe(true);
  });

  it('turns a JSON answer before the stream into an ApiError with its reset time', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'QUOTA_EXCEEDED',
              message: 'No questions left',
              requestId: 'r1',
              resetsAt: QUOTA.resetsAt,
            },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const error = await collect(
      streamBriefing(REQUEST, { signal: new AbortController().signal, fetch: fetchMock }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'QUOTA_EXCEEDED', status: 429, resetsAt: QUOTA.resetsAt });
  });

  it('rejects an event whose data does not match its schema', async () => {
    const fetchMock = vi.fn(async () => textResponse(sse('meta', { queryId: 1 })));
    await expect(
      collect(streamBriefing(REQUEST, { signal: new AbortController().signal, fetch: fetchMock })),
    ).rejects.toThrow();
  });

  it('rejects an a2ui event that is not a server message', async () => {
    const notAMessage = { version: '1.0', render: { surfaceId: 'x' } };
    const fetchMock = vi.fn(async () => textResponse(sse('a2ui', notAMessage)));
    await expect(
      collect(streamBriefing(REQUEST, { signal: new AbortController().signal, fetch: fetchMock })),
    ).rejects.toThrow();
  });

  it('passes the abort signal to fetch and cancels the body when the consumer stops early', async () => {
    const stream = controlledStream();
    const fetchMock = vi.fn(async () => stream.response);
    const controller = new AbortController();
    const iterator = streamBriefing(REQUEST, { signal: controller.signal, fetch: fetchMock });

    const first = iterator.next();
    stream.send(sse('a2ui', DELETE));
    await first;
    await iterator.return(undefined);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
    expect(stream.cancelled).toHaveBeenCalled();
  });
});
