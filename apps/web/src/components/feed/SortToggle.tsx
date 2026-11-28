'use client';

import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { useFeedFilters } from './useFeedFilters';

const SORT_OPTIONS = [
  { value: 'top', label: 'Top' },
  { value: 'latest', label: 'Latest' },
] as const;

/** The Top / Latest switch. */
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
