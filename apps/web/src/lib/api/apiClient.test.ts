import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from './apiClient';
import { ApiError, ApiResponseError } from './apiError';
import { FeedPageSchema } from '@devbrief/shared';

function clientAnswering(body: unknown, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), init));
  return {
    fetchMock,
    client: createApiClient({
      baseUrl: 'http://api.test',
      internalToken: 'test-internal-token',
      fetch: fetchMock,
    }),
  };
}

describe('createApiClient', () => {
  it('parses a valid response, sends credentials and builds the url from base, prefix and query', async () => {
    const { client, fetchMock } = clientAnswering({ items: [], nextCursor: null });
    const page = await client.request(
      { path: '/feed', query: { sort: 'latest', q: undefined } },
      FeedPageSchema,
    );
    expect(page).toEqual({ items: [], nextCursor: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/feed?sort=latest',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('throws ApiResponseError when the response does not match its schema', async () => {
    const { client } = clientAnswering({ items: 'nope' });
    await expect(client.request({ path: '/feed' }, FeedPageSchema)).rejects.toBeInstanceOf(
      ApiResponseError,
    );
  });

  it('throws a typed ApiError carrying code, message and request id for an error body', async () => {
    const { client } = clientAnswering(
      { error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'req-1' } },
      { status: 404 },
    );
    const failure = await client.request({ path: '/stories/x' }, FeedPageSchema).catch((e) => e);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Not found.',
      requestId: 'req-1',
      status: 404,
    });
  });

  it('throws ApiResponseError for an error status whose body is not an ApiError', async () => {
    const { client } = clientAnswering('<html>bad gateway</html>', { status: 502 });
    await expect(client.request({ path: '/feed' }, FeedPageSchema)).rejects.toBeInstanceOf(
      ApiResponseError,
    );
  });

  it('sends a JSON body and resolves on 204 for requestNoContent', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: 'http://api.test',
      internalToken: 'test-internal-token',
      fetch: fetchMock,
    });
    await client.requestNoContent({ method: 'DELETE', path: '/me' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/me',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  describe('internal token', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('sends x-internal-token when running on the server', async () => {
      const { client, fetchMock } = clientAnswering({ items: [], nextCursor: null });
      await client.request({ path: '/feed' }, FeedPageSchema);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { 'x-internal-token': 'test-internal-token' } }),
      );
    });

    it('never sends x-internal-token from the browser', async () => {
      vi.stubGlobal('window', {});
      const { client, fetchMock } = clientAnswering({ items: [], nextCursor: null });
      await client.request({ path: '/feed' }, FeedPageSchema);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: {} }),
      );
    });
  });
});
