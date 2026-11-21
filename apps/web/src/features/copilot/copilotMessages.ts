import type { FailureCode } from './briefingBarReducer';

export const SPEND_CAP_BANNER = "Live answers are paused for today — here's an example briefing.";

export const STREAM_FAILED = "Couldn't finish this briefing.";

/** The reset time in the reader's own clock; the API sends a UTC instant. */
export function formatResetTime(resetsAt: string | undefined) {
  if (!resetsAt) return 'midnight UTC';
  return new Date(resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function quotaExceededMessage(resetsAt: string | undefined) {
  return `No questions left today — resets at ${formatResetTime(resetsAt)}.`;
}

// Codes that get their own sentence; every other failure reads as a generic one.
const REQUEST_FAILURES = {
  RATE_LIMITED: 'Too many questions in a short time. Wait a minute and try again.',
  FEATURE_DISABLED: 'Ask the News is not available right now.',
  VALIDATION_FAILED: "That question can't be answered. Try rewording it.",
  SPEND_CAP_REACHED: 'Live answers are paused for today. Come back tomorrow.',
} as const satisfies Partial<Record<FailureCode, string>>;

// Asking the same question again cannot change these answers.
const FINAL_FAILURES: readonly FailureCode[] = [
  'FEATURE_DISABLED',
  'VALIDATION_FAILED',
  'SPEND_CAP_REACHED',
];

export const isRetryable = (code: FailureCode) => !FINAL_FAILURES.includes(code);

/** The inline message for a question that failed before any component arrived. */
export function requestFailedMessage(code: FailureCode) {
  return code in REQUEST_FAILURES
    ? REQUEST_FAILURES[code as keyof typeof REQUEST_FAILURES]
    : "Couldn't get an answer. Check your connection and try again.";
}
