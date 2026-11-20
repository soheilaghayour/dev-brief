import { isTagSlug, type Preferences } from '@devbrief/shared';
import type { PreferenceEntry, PreferenceKind, PreferenceMode } from './preferenceEntries.js';

/** Builds the preference set from a user's rows, lists sorted and retired tags dropped, so the output is stable and parses. */
export function toPreferences(entries: readonly PreferenceEntry[]): Preferences {
  const values = (mode: PreferenceMode, kind: PreferenceKind) =>
    entries
      .filter((entry) => entry.mode === mode && entry.kind === kind)
      .map((entry) => entry.value)
      .sort();
  return {
    follow: {
      tags: values('follow', 'tag').filter(isTagSlug),
      sources: values('follow', 'source'),
    },
    mute: { tags: values('mute', 'tag').filter(isTagSlug), sources: values('mute', 'source') },
  };
}
