import type { Preferences } from '@devbrief/shared';

export type PreferenceKind = 'tag' | 'source';
export type PreferenceMode = keyof Preferences;

/** One `FeedPreference` row's data: a (kind, value) and its mode. */
export type PreferenceEntry = { kind: PreferenceKind; value: string; mode: PreferenceMode };

/** The identity of a row: one mode per (kind, value), as the table's primary key says. */
export function preferenceKey({ kind, value }: Pick<PreferenceEntry, 'kind' | 'value'>) {
  return `${kind}:${value}`;
}

function entriesOfMode(preferences: Preferences, mode: PreferenceMode): PreferenceEntry[] {
  return [
    ...preferences[mode].tags.map((value) => ({ kind: 'tag' as const, value, mode })),
    ...preferences[mode].sources.map((value) => ({ kind: 'source' as const, value, mode })),
  ];
}

/** Flattens a preference set into one entry per (kind, value), in list order, dropping repeats. */
export function preferenceEntries(preferences: Preferences) {
  const entries = new Map<string, PreferenceEntry>();
  for (const entry of [
    ...entriesOfMode(preferences, 'follow'),
    ...entriesOfMode(preferences, 'mute'),
  ]) {
    if (!entries.has(preferenceKey(entry))) entries.set(preferenceKey(entry), entry);
  }
  return [...entries.values()];
}
