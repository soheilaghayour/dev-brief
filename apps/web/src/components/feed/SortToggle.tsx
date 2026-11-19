'use client';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useFeedFilters } from './useFeedFilters';

const SORT_OPTIONS = [
  { value: 'top', label: 'Top' },
  { value: 'latest', label: 'Latest' },
] as const;

/** Top / Latest as a pressed-button pair; the `t` shortcut lives with the feed list. */
export function SortToggle({ className }: { className?: string }) {
  const { filters, setSort } = useFeedFilters();

  return (
    <div
      role="group"
      aria-label="Sort"
      className={cn('bg-muted inline-flex rounded-md border p-0.5', className)}
    >
      {SORT_OPTIONS.map(({ value, label }) => (
        <Button
          key={value}
          variant="ghost"
          size="sm"
          aria-pressed={filters.sort === value}
          className={cn(
            'text-muted-foreground h-6 rounded-sm px-2.5',
            filters.sort === value && 'bg-background text-foreground shadow-sm',
          )}
          onClick={() => setSort(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
