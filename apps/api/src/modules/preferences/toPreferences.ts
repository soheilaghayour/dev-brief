import { TAG_SLUGS, type Preferences, type TagSlug } from '@devbrief/shared';
import type {
  PreferenceEntry,
  PreferenceKind,
  PreferenceMode,
} from '../../common/preferences/preferenceEntries.js';

// A tag retired by a taxonomy bump is dropped, so a stored set never fails the contract.
const TAG_SLUG_SET: ReadonlySet<string> = new Set(TAG_SLUGS);
const isTagSlug = (tag: string): tag is TagSlug => TAG_SLUG_SET.has(tag);

/** Builds the preference set from a user's rows, each list sorted so the output is stable. */
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
