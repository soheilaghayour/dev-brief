import { describe, expect, it } from 'vitest';
import { summaryFixtureFetch } from '../../../test/summaryFixtures.js';
import { DEVTO_REQUEST_GAP_MS, DevtoClient } from '../../common/devto/devtoClient.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { HttpClient } from '../../common/http/httpClient.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import { SummaryInputsService } from './summaryInputs.service.js';

type StoryRow = {
  id?: string;
  title: string;
  excerpt: string | null;
  items: { externalId: string; source: { kind: string } }[];
};

const item = (kind: string, externalId: string) => ({ externalId, source: { kind } });

function inputsService(
  stories: StoryRow | null | StoryRow[],
  fetchStub: typeof fetch,
  { clock = { now: 0 }, events = [] as string[] } = {},
) {
  // Only the story read is used, so a stand-in replaces the database.
  const rows = Array.isArray(stories) ? stories : [stories];
  const findUnique = async ({ where }: { where: { id: string } }) =>
    rows.find((row) => row && (row.id ?? where.id) === where.id) ?? null;
  const prisma = { story: { findUnique } } as unknown as PrismaService;
  const recordingFetch: typeof fetch = async (input, init) => {
    events.push(`request ${new URL(String(input)).pathname}`);
    return fetchStub(input, init);
  };
  const pause = async (ms: number) => {
    events.push(`pause ${ms}`);
    clock.now += ms;
  };
  // random = 0 makes retry backoff instant.
  const http = new HttpClient(recordingFetch, () => 0);
  return new SummaryInputsService(prisma, http, new DevtoClient(http, pause, () => clock.now));
}

describe('collectSummaryInputs', () => {
  it("reads the HN thread from Algolia and the Dev.to article's body as the text", async () => {
    const { fetch: fixtureFetch, requests } = summaryFixtureFetch();
    const service = inputsService(
      {
        title: 'A story',
        excerpt: 'The excerpt',
        items: [item('hn', '50544168'), item('devto', '5071647')],
      },
      fixtureFetch,
    );

    const inputs = await service.collectSummaryInputs('story-1');

    expect(inputs.title).toBe('A story');
    expect(inputs.text).toMatch(/^Hey everyone!/);
    expect(inputs.threads).toHaveLength(2);
    expect(inputs.threads[0]).toHaveLength(12);
    expect(requests.sort()).toEqual([
      'https://dev.to/api/articles/5071647',
      'https://dev.to/api/comments?a_id=5071647',
      'https://hn.algolia.com/api/v1/items/50544168',
    ]);
  });

  it('uses the excerpt when the story has no Dev.to item', async () => {
    const service = inputsService(
      { title: 'An RSS post', excerpt: 'The excerpt', items: [item('rss', 'abc')] },
      summaryFixtureFetch().fetch,
    );

    expect(await service.collectSummaryInputs('story-1')).toMatchObject({
      text: 'The excerpt',
      threads: [],
    });
  });

  it('sends Dev.to requests one at a time, at least the gap apart, with the Accept header', async () => {
    const { fetch: fixtureFetch } = summaryFixtureFetch();
    const headers: RequestInit['headers'][] = [];
    const events: string[] = [];
    const service = inputsService(
      {
        title: 'A post',
        excerpt: null,
        items: [item('devto', '5071647'), item('devto', '5075072')],
      },
      async (input, init) => {
        headers.push(init?.headers);
        return fixtureFetch(input, init);
      },
      { events },
    );

    await service.collectSummaryInputs('story-1');

    // The gap runs from the end of one request to the start of the next.
    const pause = `pause ${DEVTO_REQUEST_GAP_MS}`;
    expect(events).toEqual([
      'request /api/comments',
      pause,
      'request /api/comments',
      pause,
      'request /api/articles/5071647',
    ]);
    for (const sent of headers) {
      expect(sent).toMatchObject({ Accept: 'application/vnd.forem.api-v1+json' });
    }
  });

  it("throws SummaryInputsUnavailableError when any fetch fails, scoped to the story for a 404 and to the upstream for a 5xx", async () => {
    const story = { title: 'A story', excerpt: null, items: [item('hn', '50544168')] };

    const failing = inputsService(
      story,
      summaryFixtureFetch({ failing: ['hn.algolia.com'] }).fetch,
    );
    await expect(failing.collectSummaryInputs('story-1')).rejects.toEqual(
      expect.objectContaining({ name: 'SummaryInputsUnavailableError', scope: 'upstream' }),
    );

    const missing = inputsService(
      { ...story, items: [item('devto', '999')] },
      summaryFixtureFetch().fetch,
    );
    const error = await missing.collectSummaryInputs('story-1').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SummaryInputsUnavailableError);
    expect(error).toMatchObject({ scope: 'story' });
  });

  it("cancels the story's queued Dev.to requests once one of its fetches failed", async () => {
    const { fetch: fixtureFetch, requests } = summaryFixtureFetch({ missing: ['/comments'] });
    const service = inputsService(
      { title: 'A post', excerpt: null, items: [item('devto', '5071647')] },
      fixtureFetch,
    );

    await expect(service.collectSummaryInputs('story-1')).rejects.toBeInstanceOf(
      SummaryInputsUnavailableError,
    );

    expect(requests).toEqual(['https://dev.to/api/comments?a_id=5071647']);
  });

  it('makes no request once the signal has aborted', async () => {
    const { fetch: fixtureFetch, requests } = summaryFixtureFetch();
    const service = inputsService(
      { title: 'A story', excerpt: null, items: [item('hn', '50544168'), item('devto', '5071647')] },
      fixtureFetch,
    );

    await expect(
      service.collectSummaryInputs('story-1', { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ scope: 'upstream' });
    expect(requests).toEqual([]);
  });

  it('keeps at most 4 Algolia requests in flight across all stories at once', async () => {
    const { fetch: fixtureFetch } = summaryFixtureFetch({ hnFallbackId: '50544168' });
    let inFlight = 0;
    let mostInFlight = 0;
    const countingFetch: typeof fetch = async (input, init) => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return fixtureFetch(input, init);
    };
    const story = (id: string) => ({
      id,
      title: id,
      excerpt: null,
      items: ['1', '2', '3'].map((n) => item('hn', `${id}${n}`)),
    });
    const service = inputsService([story('10'), story('20')], countingFetch);

    await Promise.all([service.collectSummaryInputs('10'), service.collectSummaryInputs('20')]);

    expect(mostInFlight).toBe(4);
  });

  it('throws NOT_FOUND for an unknown story', async () => {
    const service = inputsService(null, summaryFixtureFetch().fetch);

    await expect(service.collectSummaryInputs('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<ApiException>);
  });
});
