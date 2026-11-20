'use client';

import { XIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { TAG_LABELS } from '@devbrief/shared';
import type { Preferences } from '@devbrief/shared';
import { sourcesQueryOptions } from '@/components/feed/feedQueries';
import { Button } from '@/components/ui/Button';
import type { PreferenceMode } from '@/lib/guest/preferences';
import { usePreferences } from './usePreferences';

type Chip = { key: string; label: string; remove: () => void };

const REMOVE_VERB = { follow: 'Unfollow', mute: 'Unmute' } as const satisfies Record<
  PreferenceMode,
  string
>;
const LIST_TITLE = { follow: 'Followed', mute: 'Muted' } as const satisfies Record<
  PreferenceMode,
  string
>;

function PreferenceChip({ label, remove, verb }: Omit<Chip, 'key'> & { verb: string }) {
  return (
    <Button variant="secondary" size="xs" aria-label={`${verb} ${label}`} onClick={remove}>
      {label}
      <XIcon className="size-3" aria-hidden="true" />
    </Button>
  );
}

function PreferenceList({ mode, chips }: { mode: PreferenceMode; chips: Chip[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground mr-1 text-sm">{LIST_TITLE[mode]}:</span>
      {chips.length === 0 ? (
        <span className="text-muted-foreground text-sm">none</span>
      ) : (
        chips.map(({ key, ...chip }) => (
          <PreferenceChip key={key} verb={REMOVE_VERB[mode]} {...chip} />
        ))
      )}
    </div>
  );
}

/** The followed and muted tags and sources as chips; × removes one (PRD §7.3). */
export function FeedPreferencesSection() {
  const { isReady, prefs, setMode } = usePreferences();
  const { data: sources } = useQuery(sourcesQueryOptions);
  const sourceNames = new Map(sources?.sources.map((source) => [source.slug, source.name]));

  function chipsOf(lists: Preferences[PreferenceMode]): Chip[] {
    return [
      ...lists.tags.map((tag) => ({
        key: `tag:${tag}`,
        label: TAG_LABELS[tag],
        remove: () => setMode('tag', tag, null),
      })),
      ...lists.sources.map((slug) => ({
        key: `source:${slug}`,
        // A source removed since keeps its slug, which still identifies it.
        label: sourceNames.get(slug) ?? slug,
        remove: () => setMode('source', slug, null),
      })),
    ];
  }

  return (
    <section aria-labelledby="feed-preferences-heading" className="flex flex-col gap-3">
      <h2 id="feed-preferences-heading" className="text-sm font-medium">
        Feed
      </h2>
      <p className="text-muted-foreground text-sm">
        Follow or mute a tag or source from its badge. Followed stories rank higher; muted ones
        never appear.
      </p>
      {isReady && (
        <>
          <PreferenceList mode="follow" chips={chipsOf(prefs.follow)} />
          <PreferenceList mode="mute" chips={chipsOf(prefs.mute)} />
        </>
      )}
    </section>
  );
}
