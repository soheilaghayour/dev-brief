import type { Preferences } from '@devbrief/shared';
import { EMPTY_PREFERENCES, parseStoredGuest } from './guestState';
import { GUEST_STORAGE_KEY, guestStorage, useGuestStore } from './guestStore';
import { useGuestReady } from './hydrateGuestStore';

function stringsAt(value: unknown, path: readonly string[]) {
  let node = value;
  for (const key of path) {
    if (typeof node !== 'object' || node === null) return [];
    node = (node as Record<string, unknown>)[key];
  }
  return Array.isArray(node) ? node.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Puts the stored mutes into the store before the Zod parser's chunk has loaded, so muted cards leave the first hydrated render.
 * Exception to parsing at the boundary: these strings only hide cards, and the parser's read replaces them.
 */
export function applyStoredMutes() {
  if (useGuestReady.getState().ready) return;
  const stored = parseStoredGuest(guestStorage.getItem(GUEST_STORAGE_KEY));
  const tags = stringsAt(stored?.state, ['prefs', 'mute', 'tags']) as Preferences['mute']['tags'];
  const sources = stringsAt(stored?.state, ['prefs', 'mute', 'sources']);
  if (tags.length === 0 && sources.length === 0) return;
  useGuestStore.setState({ prefs: { ...EMPTY_PREFERENCES, mute: { tags, sources } } });
}
