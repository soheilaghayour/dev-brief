import { FEED_LIST_MAX, type Preferences } from '@devbrief/shared';
import {
  preferenceEntries,
  preferenceKey,
  type PreferenceEntry,
} from '../../common/preferences/preferenceEntries.js';
import { toPreferences } from '../../common/preferences/toPreferences.js';

type PreferenceMergeInput = {
  incoming: Preferences;
  /** Every preference the account already has. */
  existing: readonly PreferenceEntry[];
};

export type PreferenceMergePlan = {
  toCreate: PreferenceEntry[];
  /** Distinct incoming (kind, value) pairs the account holds after the merge, whether or not they changed anything. */
  mergedCount: number;
};

const listKey = ({ mode, kind }: PreferenceEntry) => `${mode}:${kind}`;

/** Decides what a guest → account merge adds to the preferences: the server keeps its mode for a (kind, value) it has, and no list grows past FEED_LIST_MAX. */
export function planPreferenceMerge({
  incoming,
  existing,
}: PreferenceMergeInput): PreferenceMergePlan {
  const existingKeys = new Set(existing.map(preferenceKey));
  const listSizes = new Map<string, number>();
  // Only what GET returns counts toward the cap: a retired tag is hidden and must not take a slot.
  for (const entry of preferenceEntries(toPreferences(existing))) {
    listSizes.set(listKey(entry), (listSizes.get(listKey(entry)) ?? 0) + 1);
  }
  const plan: PreferenceMergePlan = { toCreate: [], mergedCount: 0 };
  for (const entry of preferenceEntries(incoming)) {
    if (existingKeys.has(preferenceKey(entry))) {
      plan.mergedCount += 1;
      continue;
    }
    const size = listSizes.get(listKey(entry)) ?? 0;
    // A full list drops the rest, so the account's set still gives a valid feed URL.
    if (size >= FEED_LIST_MAX) continue;
    listSizes.set(listKey(entry), size + 1);
    plan.toCreate.push(entry);
    plan.mergedCount += 1;
  }
  return plan;
}
