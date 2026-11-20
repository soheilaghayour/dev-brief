import { describe, expect, it } from 'vitest';
import { HttpClient } from '../http/httpClient.js';
import { DEVTO_REQUEST_GAP_MS, DevtoClient } from './devtoClient.js';

function clientWith(fetchStub: typeof fetch = async () => Response.json([])) {
  const events: string[] = [];
  const clock = { now: 0 };
  const recordingFetch: typeof fetch = async (input, init) => {
    events.push(`start ${new URL(String(input)).pathname}`);
    clock.now += 100;
    const response = await fetchStub(input, init);
    events.push(`end ${new URL(String(input)).pathname}`);
    return response;
  };
  const pause = async (ms: number) => {
    events.push(`pause ${ms}`);
    clock.now += ms;
  };
  // random = 0 makes retry backoff instant.
  const client = new DevtoClient(new HttpClient(recordingFetch, () => 0), pause, () => clock.now);
  return { client, events };
}

describe('DevtoClient', () => {
  it('runs the requests of all callers one at a time, each the gap after the previous one ended', async () => {
    const { client, events } = clientWith();

    // An ingestion list request and a summary's comment request, issued together.
    await Promise.all([client.getJson('/articles'), client.getJson('/comments')]);

    expect(events).toEqual([
      'start /api/articles',
      'end /api/articles',
      `pause ${DEVTO_REQUEST_GAP_MS}`,
      'start /api/comments',
      'end /api/comments',
    ]);
  });

  it('keeps the queue going after a failed request, and skips a queued request whose signal aborted', async () => {
    const { client, events } = clientWith(async (input) =>
      String(input).includes('/fails') ? new Response('', { status: 404 }) : Response.json([]),
    );
    const cancelled = new AbortController();

    const settled = Promise.allSettled([
      client.getJson('/fails'),
      client.getJson('/cancelled', cancelled.signal),
      client.getJson('/next'),
    ]);
    cancelled.abort();
    const results = await settled;

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected', 'fulfilled']);
    expect(events.filter((event) => event.startsWith('start'))).toEqual([
      'start /api/fails',
      'start /api/next',
    ]);
  });
});
