'use client';

import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { useFeedFilters } from './useFeedFilters';

const SORT_OPTIONS = [
  { value: 'top', label: 'Top' },
  { value: 'latest', label: 'Latest' },
] as const;

/** Top / Latest; the `t` shortcut lives with the feed list. */
export function SortToggle({ className }: { className?: string }) {
  const { filters, setSort } = useFeedFilters();

  return (
    <ToggleGroup
      label="Sort"
      options={SORT_OPTIONS}
      value={filters.sort}
      onValueChange={setSort}
      className={className}
    />
  );
}
