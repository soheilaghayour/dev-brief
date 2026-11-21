import type { ToggleOutcome } from './guestState';
import { MAX_GUEST_SAVES } from './guestState';

const SAVE_NOTICE_KINDS = ['saved-on-device', 'storage-unavailable', 'full'] as const;
export type SaveNoticeKind = (typeof SAVE_NOTICE_KINDS)[number];

export function isSaveNoticeKind(value: unknown): value is SaveNoticeKind {
  return SAVE_NOTICE_KINDS.some((kind) => kind === value);
}

/** Shown when a guest's save list is full, whatever added the save. */
export const SAVES_FULL_MESSAGE = `You can keep up to ${MAX_GUEST_SAVES} saves as a guest. Remove one or sign in.`;

const MESSAGES = {
  'saved-on-device': 'Saved on this device · Sign in to sync',
  'storage-unavailable':
    'Your browser blocks storage, so saves last only until you close this tab. Sign in to keep them.',
  full: SAVES_FULL_MESSAGE,
} satisfies Record<SaveNoticeKind, string>;

/** The toast a save deserves, or null; the on-device and storage notices show once per session. */
export function saveNotice({
  outcome,
  memoryOnly,
  alreadyShown,
}: {
  outcome: ToggleOutcome;
  memoryOnly: boolean;
  alreadyShown: ReadonlySet<SaveNoticeKind>;
}) {
  const kind = pickKind(outcome, memoryOnly, alreadyShown);
  return kind && { kind, message: MESSAGES[kind] };
}

function pickKind(
  outcome: ToggleOutcome,
  memoryOnly: boolean,
  alreadyShown: ReadonlySet<SaveNoticeKind>,
): SaveNoticeKind | null {
  if (outcome === 'removed') return null;
  if (outcome === 'full') return 'full';
  if (memoryOnly) return alreadyShown.has('storage-unavailable') ? null : 'storage-unavailable';
  return alreadyShown.has('saved-on-device') ? null : 'saved-on-device';
}
