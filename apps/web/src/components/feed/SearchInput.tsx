'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { SearchIcon } from 'lucide-react';
import { FEED_QUERY_MAX } from '@devbrief/shared';
import { Input } from '@/components/ui/Input';
import { Kbd } from '@/components/ui/Kbd';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';
import { useFeedFilters } from './useFeedFilters';

const FOCUS_SEARCH = {
  id: 'focus-search',
  keys: '/',
  description: 'Focus search',
  scope: 'Feed',
} satisfies Shortcut;

const URL_DEBOUNCE_MS = 250;

/** The search box: typing updates the `q` URL param after a 250 ms pause. */
export function SearchInput() {
  const { filters, setQuery } = useFeedFilters();
  const urlQuery = filters.q;
  const [draft, setDraft] = useState(urlQuery);
  // The query the draft last agreed with; a URL change from elsewhere (Clear all, a chip) resets the draft.
  const [agreedQuery, setAgreedQuery] = useState(urlQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  if (urlQuery !== agreedQuery) {
    setAgreedQuery(urlQuery);
    setDraft(urlQuery);
  }

  useEffect(() => {
    const next = draft.trim();
    if (next === urlQuery) return;
    const timer = setTimeout(() => {
      setAgreedQuery(next);
      void setQuery(next);
    }, URL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, urlQuery, setQuery]);

  function updateDraft(event: ChangeEvent<HTMLInputElement>) {
    setDraft(event.target.value);
  }
  function focusSearch(event: KeyboardEvent) {
    event.preventDefault();
    inputRef.current?.focus();
  }

  useShortcut(FOCUS_SEARCH, focusSearch);

  return (
    <div className="relative w-full max-w-md">
      <SearchIcon
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        type="search"
        aria-label="Search stories"
        placeholder="Search stories…"
        value={draft}
        maxLength={FEED_QUERY_MAX}
        onChange={updateDraft}
        className="pr-8 pl-8"
      />
      {draft === '' && (
        <Kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 md:inline-flex">
          /
        </Kbd>
      )}
    </div>
  );
}
