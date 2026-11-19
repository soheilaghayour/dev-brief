import { isSaveNoticeKind, type SaveNoticeKind } from './saveNotice';

const SESSION_KEY = 'devbrief:notices';
const shownInMemory = new Set<SaveNoticeKind>();

/** The notices already shown in this browser session; sessionStorage can throw, so memory backs it. */
export function shownNotices(): ReadonlySet<SaveNoticeKind> {
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? '[]');
    if (Array.isArray(stored))
      stored.filter(isSaveNoticeKind).forEach((kind) => shownInMemory.add(kind));
  } catch {
    // Memory alone then covers this page load.
  }
  return shownInMemory;
}

export function markNoticeShown(kind: SaveNoticeKind) {
  shownInMemory.add(kind);
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify([...shownInMemory]));
  } catch {
    // Not persisted; the notice may repeat after a reload.
  }
}
