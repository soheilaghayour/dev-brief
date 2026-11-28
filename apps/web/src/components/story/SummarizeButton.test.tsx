// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorySummary } from '@devbrief/shared';
import { ApiError } from '@/lib/api/apiError';
import { SummarizeButton } from './SummarizeButton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ summarizeStory: vi.fn() }));
vi.mock('@/lib/api/endpoints', () => api);
vi.mock('@/lib/guest/loadDeviceId', () => ({ loadDeviceId: async () => 'device-1' }));
const me = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: me.user }) }));

const SUMMARY: StorySummary = {
  storyId: 'story-1',
  tldr: ['First point', 'Second point', 'Third point'],
  consensus: null,
  model: 'claude-haiku-5-5',
  createdAt: '2026-11-20T10:00:00.000Z',
};

const ORIGIN = {
  url: 'https://example.com/post',
  domain: 'example.com',
  sourceNames: ['Hacker News'],
};

let container: HTMLDivElement;
let unmount = () => {};
let queryClient: QueryClient;

async function render() {
  queryClient = new QueryClient();
  const root = createRoot(container);
  unmount = () => act(() => root.unmount());
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <SummarizeButton storyId="story-1" origin={ORIGIN} />
      </QueryClientProvider>,
    );
  });
}

const button = () => container.querySelector('button');

async function click() {
  await act(async () => {
    button()?.click();
  });
  // The request settles after the mocked endpoints module has loaded.
  await act(async () => {
    await new Promise((done) => setTimeout(done, 10));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  api.summarizeStory.mockReset();
  me.user = null;
});

afterEach(async () => {
  await unmount();
  container.remove();
});

describe('SummarizeButton', () => {
  it('AC-2.3.2 shows a busy spinner while pending, then the summary in place', async () => {
    let resolve: (summary: StorySummary) => void = () => {};
    api.summarizeStory.mockReturnValue(new Promise((done) => (resolve = done)));
    await render();

    await click();

    expect(button()?.getAttribute('aria-busy')).toBe('true');
    expect(button()?.disabled).toBe(true);
    expect(container.querySelector('svg.animate-spin')).not.toBeNull();
    expect(api.summarizeStory).toHaveBeenCalledWith('story-1', 'device-1');

    await act(async () => {
      resolve(SUMMARY);
      await new Promise((done) => setTimeout(done, 10));
    });

    expect(container.textContent).toContain('First point');
    expect(container.textContent).toContain('Not enough discussion yet');
    expect(button()).toBeNull();
    expect(queryClient.getQueryData(['summary', 'story-1'])).toEqual(SUMMARY);
  });

  it('AC-2.3.11 shows the original link and the sources on a fresh summary', async () => {
    api.summarizeStory.mockResolvedValue(SUMMARY);
    await render();

    await click();

    expect(container.querySelector('a')?.getAttribute('href')).toBe(ORIGIN.url);
    expect(container.textContent).toContain('Source: Hacker News');
  });

  it('AC-2.3.4 shows the budget copy on 503 SPEND_CAP_REACHED', async () => {
    api.summarizeStory.mockRejectedValue(
      new ApiError('SPEND_CAP_REACHED', 'cap', 'r1', 503, undefined),
    );
    await render();

    await click();

    expect(container.querySelector('[aria-live]')?.textContent).toBe(
      'Daily AI budget reached — try again tomorrow',
    );
    expect(button()?.disabled).toBe(false);
  });

  it('shows the reset time and a sign-in offer to a guest on 429', async () => {
    api.summarizeStory.mockRejectedValue(
      new ApiError('QUOTA_EXCEEDED', 'quota', 'r1', 429, undefined, '2026-11-21T00:00:00.000Z'),
    );
    await render();

    await click();

    const message = container.querySelector('[aria-live]')?.textContent ?? '';
    expect(message).toMatch(/^Daily summary limit reached\. Resets at .+\./);
    expect(message).toContain('Sign in for 20 a day');
  });

  it('offers no sign-in to a signed-in user on 429', async () => {
    me.user = { id: 'u1' };
    api.summarizeStory.mockRejectedValue(
      new ApiError('QUOTA_EXCEEDED', 'quota', 'r1', 429, undefined, '2026-11-21T00:00:00.000Z'),
    );
    await render();

    await click();

    expect(container.textContent).not.toContain('Sign in for 20 a day');
  });

  it.each([
    ['GENERATION_FAILED', 502, "Couldn't generate a summary. Try again."],
    ['RATE_LIMITED', 429, 'Too many requests. Wait a minute and try again.'],
    ['UPSTREAM_UNAVAILABLE', 503, "Couldn't load the discussion. Try again later."],
    ['NOT_FOUND', 404, "This story doesn't have enough discussion to summarise."],
  ] as const)('shows the copy for %s', async (code, status, copy) => {
    api.summarizeStory.mockRejectedValue(new ApiError(code, 'x', 'r1', status, undefined));
    await render();

    await click();

    expect(container.querySelector('[aria-live]')?.textContent).toBe(copy);
  });
});
