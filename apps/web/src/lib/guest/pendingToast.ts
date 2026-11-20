const SESSION_KEY = 'devbrief:pending-toast';

const MESSAGES = {
  'account-deleted': 'Your account was deleted.',
} satisfies Record<string, string>;

type PendingToastKind = keyof typeof MESSAGES;

function isPendingToastKind(value: unknown): value is PendingToastKind {
  return typeof value === 'string' && Object.hasOwn(MESSAGES, value);
}

let queuedInMemory: PendingToastKind | null = null;

/** Queues a toast for the page the app navigates to next. */
export function queuePendingToast(kind: PendingToastKind) {
  queuedInMemory = kind;
  try {
    // Storage survives the full page load Next falls back to when a deploy lands mid-session.
    window.sessionStorage.setItem(SESSION_KEY, kind);
  } catch {
    // Memory alone then carries it across the client-side navigation.
  }
}

/** Removes the queued toast and returns its message, or null when none is queued. */
export function takePendingToast() {
  const kind = takeStoredKind() ?? queuedInMemory;
  queuedInMemory = null;
  return kind && MESSAGES[kind];
}

function takeStoredKind() {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    return isPendingToastKind(stored) ? stored : null;
  } catch {
    return null;
  }
}
