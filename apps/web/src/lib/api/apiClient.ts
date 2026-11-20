import { ApiErrorSchema } from '@devbrief/shared';
import type { z } from 'zod';
import { loadEnv } from '@/env';
import { ApiError, ApiResponseError } from './apiError';

type Query = Record<string, string | number | undefined>;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Query;
  body?: unknown;
  /** Next's fetch cache mode; `'no-store'` makes the calling route render per request. */
  cache?: RequestCache;
  /** The visitor's Cookie header, forwarded by server-side calls made for a signed-in visitor. */
  cookie?: string;
};

type ApiClientConfig = {
  baseUrl?: string;
  internalToken?: string;
  fetch?: typeof fetch;
};

// The server reaches the API directly; the browser uses same-origin paths that the proxy routes.
function defaultBaseUrl() {
  return typeof window === 'undefined' ? loadEnv().API_INTERNAL_URL : '';
}

// Server-side calls carry no visitor IP, so they identify themselves to skip the per-IP rate limit.
function requestHeaders(hasBody: boolean, internalToken?: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (typeof window === 'undefined') {
    headers['x-internal-token'] = internalToken ?? loadEnv().INTERNAL_API_TOKEN;
    if (cookie) headers.cookie = cookie;
  }
  return headers;
}

function buildUrl(baseUrl: string, path: string, query: Query = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const queryString = search.size > 0 ? `?${search}` : '';
  return `${baseUrl}/api/v1${path}${queryString}`;
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ApiResponseError('The API response is not valid JSON.', response.status);
  }
}

async function toApiError(response: Response) {
  const parsed = ApiErrorSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new ApiResponseError(
      'The API error response does not match ApiErrorSchema.',
      response.status,
    );
  }
  const { code, message, requestId, details } = parsed.data.error;
  return new ApiError(code, message, requestId, response.status, details);
}

/** Creates the typed client: every response is parsed with its shared schema, every error becomes an ApiError. */
export function createApiClient({
  baseUrl,
  internalToken,
  fetch: fetchImpl = fetch,
}: ApiClientConfig = {}) {
  async function send({ method = 'GET', path, query, body, cache, cookie }: RequestOptions) {
    const response = await fetchImpl(buildUrl(baseUrl ?? defaultBaseUrl(), path, query), {
      method,
      credentials: 'include',
      cache,
      headers: requestHeaders(body !== undefined, internalToken, cookie),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw await toApiError(response);
    return response;
  }

  /** Sends a request and returns the 2xx body parsed with `schema`. */
  async function request<Schema extends z.ZodTypeAny>(
    options: RequestOptions,
    schema: Schema,
  ): Promise<z.output<Schema>> {
    const response = await send(options);
    const parsed = schema.safeParse(await readJson(response));
    if (!parsed.success) {
      throw new ApiResponseError(
        `The API response does not match its schema: ${parsed.error.message}`,
        response.status,
      );
    }
    return parsed.data;
  }

  /** Sends a request whose success answer is 204 with no body. */
  async function requestNoContent(options: RequestOptions) {
    await send(options);
  }

  return { request, requestNoContent };
}

export type ApiClient = ReturnType<typeof createApiClient>;
