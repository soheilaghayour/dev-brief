import { describe, expect, it } from 'vitest';
import type { A2uiServerMessage, CopilotQuota } from '@devbrief/shared';
import { ApiError } from '@/lib/api/apiError';
import {
  briefingBarReducer,
  initialBarState,
  type BarAction,
  type BarState,
} from './briefingBarReducer';

const QUESTION = 'Rust vs Go: what are teams choosing this week?';
const QUOTA: CopilotQuota = { limit: 3, remaining: 2, resetsAt: '2026-11-22T00:00:00.000Z' };
const MESSAGE = {
  version: '1.0',
  deleteSurface: { surfaceId: 'briefing-1' },
} as A2uiServerMessage;

const asked: BarAction = { type: 'asked', question: QUESTION };
const meta = (
  extra: { fallback?: 'SPEND_CAP' | 'NO_COVERAGE'; remaining?: number } = {},
): BarAction => ({
  type: 'meta',
  data: {
    queryId: 'q1',
    cached: false,
    ...(extra.fallback && { fallback: extra.fallback }),
    quota: { ...QUOTA, remaining: extra.remaining ?? 2 },
  },
});
const a2ui: BarAction = { type: 'a2ui', message: MESSAGE };
const done: BarAction = { type: 'done', data: {} };
const streamError: BarAction = {
  type: 'error',
  data: { code: 'GENERATION_FAILED', message: 'The briefing could not be generated.' },
};

function run(actions: BarAction[], from: BarState = initialBarState) {
  return actions.reduce(briefingBarReducer, from);
}

describe('briefingBarReducer', () => {
  it('starts idle with no quota', () => {
    expect(initialBarState).toEqual({ quota: null, view: { status: 'idle' } });
  });

  it('streams a fresh answer: meta, components, done', () => {
    const state = run([asked, meta(), a2ui, a2ui, done]);
    expect(state.view).toEqual({ status: 'done', question: QUESTION, fallback: undefined });
    expect(state.quota?.remaining).toBe(2);
  });

  it('replays a cached answer the same way', () => {
    const cached: BarAction = { type: 'meta', data: { queryId: 'q1', cached: true, quota: QUOTA } };
    expect(run([asked, cached, a2ui, done]).view.status).toBe('done');
  });

  it('keeps the SPEND_CAP fallback through to done', () => {
    const state = run([asked, meta({ fallback: 'SPEND_CAP' }), a2ui, done]);
    expect(state.view).toMatchObject({ status: 'done', fallback: 'SPEND_CAP' });
  });

  it('keeps the NO_COVERAGE fallback through to done', () => {
    const state = run([asked, meta({ fallback: 'NO_COVERAGE' }), a2ui, done]);
    expect(state.view).toMatchObject({ status: 'done', fallback: 'NO_COVERAGE' });
  });

  it('AC-3.1.4 each meta replaces the quota', () => {
    const loaded = run([{ type: 'quotaLoaded', quota: QUOTA }]);
    expect(run([asked, meta({ remaining: 1 })], loaded).quota?.remaining).toBe(1);
  });

  it('AC-3.1.4 a quota read that arrives after a meta does not overwrite it', () => {
    const state = run([asked, meta({ remaining: 1 }), { type: 'quotaLoaded', quota: QUOTA }]);
    expect(state.quota?.remaining).toBe(1);
  });

  it('AC-3.1.4 a 429 QUOTA_EXCEEDED shows the used-up quota and its reset time', () => {
    const exceeded = new ApiError(
      'QUOTA_EXCEEDED',
      'No questions left',
      'r1',
      429,
      undefined,
      '2026-11-22T00:00:00.000Z',
    );
    const state = run(
      [asked, { type: 'requestFailed', error: exceeded }],
      run([{ type: 'quotaLoaded', quota: QUOTA }]),
    );
    expect(state.view).toEqual({
      status: 'quotaExceeded',
      question: QUESTION,
      resetsAt: '2026-11-22T00:00:00.000Z',
    });
    expect(state.quota).toMatchObject({ limit: 3, remaining: 0 });
  });

  it('AC-3.1.8 an error after components keeps them: the view is failed, not error', () => {
    expect(run([asked, meta(), a2ui, streamError]).view).toMatchObject({ status: 'failed' });
  });

  it('AC-3.1.8 an error before any component is an error before the stream', () => {
    expect(run([asked, meta(), streamError]).view).toEqual({
      status: 'error',
      question: QUESTION,
      code: 'GENERATION_FAILED',
    });
  });

  it('an error event with no meta before it (an early internal failure) is an error view', () => {
    expect(run([asked, streamError]).view.status).toBe('error');
  });

  it('a stream that closes without done is failed after output and an error without', () => {
    expect(run([asked, meta(), a2ui, { type: 'ended' }]).view.status).toBe('failed');
    expect(run([asked, meta(), { type: 'ended' }]).view).toMatchObject({
      status: 'error',
      code: 'NETWORK',
    });
  });

  it('a request that fails before the stream keeps the API code, a lost connection becomes NETWORK', () => {
    const limited = new ApiError('RATE_LIMITED', 'Slow down', 'r2', 429, undefined);
    expect(run([asked, { type: 'requestFailed', error: limited }]).view).toMatchObject({
      status: 'error',
      code: 'RATE_LIMITED',
    });
    expect(
      run([asked, { type: 'requestFailed', error: new TypeError('fetch failed') }]).view,
    ).toMatchObject({
      status: 'error',
      code: 'NETWORK',
    });
  });

  it('a connection lost after components stays failed', () => {
    const state = run([asked, meta(), a2ui, { type: 'requestFailed', error: new TypeError('x') }]);
    expect(state.view.status).toBe('failed');
  });

  it('a new question replaces a failed one and the retry starts clean', () => {
    const failed = run([asked, meta(), a2ui, streamError]);
    expect(run([asked], failed).view).toEqual({
      status: 'streaming',
      question: QUESTION,
      fallback: undefined,
      hasOutput: false,
    });
  });

  it('ignores stream events when no question is streaming', () => {
    expect(run([a2ui, meta(), done, streamError, { type: 'ended' }])).toEqual(initialBarState);
    const finished = run([asked, meta(), a2ui, done]);
    expect(run([a2ui, streamError, { type: 'ended' }], finished)).toEqual(finished);
  });
});
