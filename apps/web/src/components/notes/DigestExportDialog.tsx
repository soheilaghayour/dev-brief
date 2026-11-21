'use client';

import { useState } from 'react';
import type { StoryCard } from '@devbrief/shared';
import { isoWeekRange, recentIsoWeeks, renderDigestMarkdown } from '@devbrief/shared';
import { ChevronDownIcon } from 'lucide-react';
import { useCollections } from '@/components/collections/useCollections';
import { useReturnFocus } from '@/components/collections/useReturnFocus';
import { useSaves } from '@/components/saves/useSaves';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { notify } from '@/lib/toast/notify';
import { copyToClipboard, digestFileName, downloadMarkdown } from './digestFile';

/** The current week and the previous 7 (AC-3.4.4). */
const WEEK_COUNT = 8;
const ALL_SAVED = 'all';

export type DigestScope = { name: string; slug: string; storyIds: readonly string[] };

type DigestExportDialogProps = {
  /** The stories the digest can draw from; their saves supply the dates and notes. */
  stories: readonly StoryCard[];
  /** A board's own collection: the digest is limited to it and has no scope choice. */
  fixedCollection?: DigestScope;
  onClose: () => void;
};

const monthDay = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function weekLabel(week: string) {
  const { start, end } = isoWeekRange(week);
  return `${week} (${monthDay.format(start)} – ${monthDay.format(new Date(end.getTime() - 1))})`;
}

/** Pick a week and a scope, then download the Markdown digest or copy it. */
export function DigestExportDialog({ stories, fixedCollection, onClose }: DigestExportDialogProps) {
  const saves = useSaves();
  const collections = useCollections();
  const returnFocus = useReturnFocus();
  // Fixed while the dialog is open, so the week list doesn't shift under a reader at midnight UTC.
  const [weeks] = useState(() => recentIsoWeeks(new Date(), WEEK_COUNT));
  const [week, setWeek] = useState(weeks[0] ?? '');
  const [scope, setScope] = useState(ALL_SAVED);

  const options = collections.status === 'ready' ? collections.collections : [];
  const chosen =
    fixedCollection ?? options.find((collection) => collection.id === scope && scope !== ALL_SAVED);
  const collection = chosen && {
    name: chosen.name,
    slug: chosen.slug,
    storyIds: 'storyIds' in chosen ? chosen.storyIds : chosen.items.map(({ storyId }) => storyId),
  };

  function buildDigest() {
    return renderDigestMarkdown({
      week,
      collection,
      items: stories.flatMap((story) => {
        const savedAt = saves.savedAt(story.id);
        if (!savedAt) return [];
        return {
          storyId: story.id,
          title: story.title,
          url: story.url,
          tags: story.tags,
          savedAt,
          note: saves.note(story.id),
        };
      }),
    });
  }
  function download() {
    downloadMarkdown(digestFileName(week, collection?.slug), buildDigest());
  }
  async function copy() {
    const copied = await copyToClipboard(buildDigest());
    await notify(
      copied ? 'Digest copied to the clipboard' : 'Couldn’t copy. Use Download .md instead.',
    );
  }
  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }
  function chooseWeek(value: string) {
    setWeek(value);
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Export weekly digest</DialogTitle>
          <DialogDescription>
            The stories you saved in a week (UTC), with their tags and notes, as Markdown.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label={`Week: ${weekLabel(week)}`}>
                {weekLabel(week)}
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup value={week} onValueChange={chooseWeek}>
                {weeks.map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {weekLabel(option)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {!fixedCollection && options.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label={`Scope: ${chosen?.name ?? 'All saved'}`}>
                  {chosen?.name ?? 'All saved'}
                  <ChevronDownIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={scope} onValueChange={setScope}>
                  <DropdownMenuRadioItem value={ALL_SAVED}>All saved</DropdownMenuRadioItem>
                  {options.map((option) => (
                    <DropdownMenuRadioItem key={option.id} value={option.id}>
                      {option.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={download}>
            Download .md
          </Button>
          <Button onClick={copy}>Copy to clipboard</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
