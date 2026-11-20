import { ApiError } from '@/lib/api/apiError';

const GENERATION_FAILED = "Couldn't generate a summary. Try again.";

// Codes with a fixed message; QUOTA_EXCEEDED is built in summaryErrorMessage because it carries a time.
const MESSAGES = {
  SPEND_CAP_REACHED: 'Daily AI budget reached — try again tomorrow',
  GENERATION_FAILED,
  RATE_LIMITED: 'Too many requests. Wait a minute and try again.',
  UPSTREAM_UNAVAILABLE: "Couldn't load the discussion. Try again later.",
} as const;

function isFixedCode(code: string): code is keyof typeof MESSAGES {
  return code in MESSAGES;
}

/** The inline message for a failed summary request, and whether to offer sign-in (a guest's quota is the smaller one). */
export function summaryErrorMessage(error: unknown, { isGuest }: { isGuest: boolean }) {
  if (error instanceof ApiError && error.code === 'QUOTA_EXCEEDED') {
    const resets = error.resetsAt
      ? new Date(error.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'midnight UTC';
    return { message: `Daily summary limit reached. Resets at ${resets}.`, offersSignIn: isGuest };
  }
  const message =
    error instanceof ApiError && isFixedCode(error.code) ? MESSAGES[error.code] : GENERATION_FAILED;
  return { message, offersSignIn: false };
}
