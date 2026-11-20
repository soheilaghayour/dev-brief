const SESSION_KEY = 'devbrief:pending-toast';
// A toast whose navigation was superseded must not show later, out of context.
const MAX_AGE_MS = 10_000;

const MESSAGES = {
  'account-deleted': 'Your account was deleted.',
} satisfies Record<string, string>;

type PendingToastKind = keyof typeof MESSAGES;
type QueuedToast = { kind: PendingToastKind; queuedAt: number };

let queuedInMemory: QueuedToast | null = null;

/** Queues a toast for the page the app navigates to next. */
export function queuePendingToast(kind: PendingToastKind) {
  queuedInMemory = { kind, queuedAt: Date.now() };
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(queuedInMemory));
  } catch {
    // Memory alone then carries it across the client-side navigation.
  }
}

/** Removes the queued toast and returns its message, or null when none is queued or it expired. */
export function takePendingToast() {
  const queued = takeStoredToast() ?? queuedInMemory;
  queuedInMemory = null;
  if (!queued || Date.now() - queued.queuedAt > MAX_AGE_MS) return null;
  return MESSAGES[queued.kind];
}

function takeStoredToast() {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored === null) return null;
    window.sessionStorage.removeItem(SESSION_KEY);
    const { kind, queuedAt }: Partial<Record<keyof QueuedToast, unknown>> = JSON.parse(stored);
    return isPendingToastKind(kind) && typeof queuedAt === 'number' ? { kind, queuedAt } : null;
  } catch {
    return null;
  }
}

function isPendingToastKind(value: unknown): value is PendingToastKind {
  return typeof value === 'string' && Object.hasOwn(MESSAGES, value);
}
