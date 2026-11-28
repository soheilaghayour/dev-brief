import type { Preferences } from '@devbrief/shared';
import { modeOf } from '@/lib/guest/preferenceModes';
import type { PreferenceMode } from '@/lib/guest/preferences';

const NEXT_MODE = { none: 'follow', follow: 'mute', mute: null } as const satisfies Record<
  PreferenceMode | 'none',
  PreferenceMode | null
>;

/** What a click on the heart sets: none → followed → muted → none. */
export function nextMode(mode: PreferenceMode | null) {
  return NEXT_MODE[mode ?? 'none'];
}

/** The state a source kind's heart shows: followed or muted only when every source of the kind is, otherwise neither. */
export function kindMode(prefs: Preferences, sourceSlugs: readonly string[]) {
  const [first, ...rest] = sourceSlugs.map((slug) => modeOf(prefs, 'source', slug));
  return first && rest.every((mode) => mode === first) ? first : null;
}
