import { FEED_LIST_MAX } from '@devbrief/shared';
import type { Preferences } from '@devbrief/shared';
import type { PreferenceKind, PreferenceMode, PreferenceValue } from './preferences';

export type PreferenceOutcome = 'changed' | 'full';

const LIST_OF = { tag: 'tags', source: 'sources' } as const satisfies Record<
  PreferenceKind,
  keyof Preferences['follow']
>;

function listOf(prefs: Preferences, mode: PreferenceMode, kind: PreferenceKind): readonly string[] {
  return prefs[mode][LIST_OF[kind]];
}

/** Whether the value is followed, muted or neither. */
export function modeOf<K extends PreferenceKind>(
  prefs: Preferences,
  kind: K,
  value: PreferenceValue[K],
): PreferenceMode | null {
  if (listOf(prefs, 'follow', kind).includes(value)) return 'follow';
  if (listOf(prefs, 'mute', kind).includes(value)) return 'mute';
  return null;
}

/** Puts the value in the mode's list (null clears it), moving it out of the other mode's list; a full list refuses a new value. */
export function setPreference<K extends PreferenceKind>(
  prefs: Preferences,
  kind: K,
  value: PreferenceValue[K],
  mode: PreferenceMode | null,
): { outcome: PreferenceOutcome; prefs: Preferences } {
  const target = mode ? listOf(prefs, mode, kind) : [];
  if (!target.includes(value) && target.length >= FEED_LIST_MAX) return { outcome: 'full', prefs };
  function without(from: PreferenceMode) {
    return listOf(prefs, from, kind).filter((existing) => existing !== value);
  }
  const lists = { follow: without('follow'), mute: without('mute') };
  if (mode) lists[mode] = [...lists[mode], value];
  const list = LIST_OF[kind];
  const next = {
    follow: { ...prefs.follow, [list]: lists.follow },
    mute: { ...prefs.mute, [list]: lists.mute },
  };
  // The lists only ever gain a value of the kind's own type.
  return { outcome: 'changed', prefs: next as Preferences };
}

/** The preferences without the entries of `sent`, so a change made while `sent` was on its way stays. */
export function withoutPreferences(current: Preferences, sent: Preferences): Preferences {
  function drop<T extends string>(list: readonly T[], gone: readonly string[]) {
    return list.filter((value) => !gone.includes(value));
  }
  return {
    follow: {
      tags: drop(current.follow.tags, sent.follow.tags),
      sources: drop(current.follow.sources, sent.follow.sources),
    },
    mute: {
      tags: drop(current.mute.tags, sent.mute.tags),
      sources: drop(current.mute.sources, sent.mute.sources),
    },
  };
}
