import type { ApiErrorCode, CopilotMetaEvent, CopilotQuota } from '@devbrief/shared';
import { ApiError } from '@/lib/api/apiError';
import type { StreamEvent } from './streamBriefing';

type Fallback = CopilotMetaEvent['fallback'];

/** Why a question got no answer: the API's code, or a connection that broke. */
export type FailureCode = ApiErrorCode | 'NETWORK';

/** What the bar shows for the current question. */
export type BriefingView =
  | { status: 'idle' }
  | { status: 'streaming'; question: string; fallback: Fallback; hasOutput: boolean }
  | { status: 'done'; question: string; fallback: Fallback }
  /** The stream broke after components arrived: they stay on screen. */
  | { status: 'failed'; question: string; fallback: Fallback }
  | { status: 'quotaExceeded'; question: string; resetsAt: string | undefined }
  /** The request failed before any component arrived. */
  | { status: 'error'; question: string; code: FailureCode };

export type BarState = { quota: CopilotQuota | null; view: BriefingView };

export type BarAction =
  | StreamEvent
  | { type: 'quotaLoaded'; quota: CopilotQuota }
  | { type: 'asked'; question: string }
  | { type: 'requestFailed'; error: unknown }
  /** The stream closed without a `done` event. */
  | { type: 'ended' };

export const initialBarState: BarState = { quota: null, view: { status: 'idle' } };

function failureCode(error: unknown): FailureCode {
  return error instanceof ApiError ? error.code : 'NETWORK';
}

/** Where a streaming view goes when the answer breaks: components already shown stay. */
function broken(
  state: BarState,
  view: Extract<BriefingView, { status: 'streaming' }>,
  code: FailureCode,
): BarState {
  if (view.hasOutput) {
    return {
      ...state,
      view: { status: 'failed', question: view.question, fallback: view.fallback },
    };
  }
  return { ...state, view: { status: 'error', question: view.question, code } };
}

function quotaUsedUp(state: BarState, question: string, error: ApiError): BarState {
  const { quota } = state;
  return {
    quota: quota && { ...quota, remaining: 0, resetsAt: error.resetsAt ?? quota.resetsAt },
    view: { status: 'quotaExceeded', question, resetsAt: error.resetsAt },
  };
}

/** The bar's state over everything that happens to it: the quota read, a new question and each stream event. */
export function briefingBarReducer(state: BarState, action: BarAction): BarState {
  const { view } = state;
  switch (action.type) {
    case 'quotaLoaded':
      // A `meta` that arrived first is newer than the read.
      return state.quota ? state : { ...state, quota: action.quota };
    case 'asked':
      return {
        ...state,
        view: {
          status: 'streaming',
          question: action.question,
          fallback: undefined,
          hasOutput: false,
        },
      };
    case 'meta':
      if (view.status !== 'streaming') return state;
      return {
        quota: action.data.quota,
        view: { ...view, fallback: action.data.fallback },
      };
    case 'a2ui':
      if (view.status !== 'streaming') return state;
      return { ...state, view: { ...view, hasOutput: true } };
    case 'done':
      if (view.status !== 'streaming') return state;
      return {
        ...state,
        view: { status: 'done', question: view.question, fallback: view.fallback },
      };
    case 'error':
      if (view.status !== 'streaming') return state;
      return broken(state, view, action.data.code);
    case 'ended':
      if (view.status !== 'streaming') return state;
      return broken(state, view, 'NETWORK');
    case 'requestFailed':
      if (view.status !== 'streaming') return state;
      if (action.error instanceof ApiError && action.error.code === 'QUOTA_EXCEEDED') {
        return quotaUsedUp(state, view.question, action.error);
      }
      return broken(state, view, failureCode(action.error));
  }
}
