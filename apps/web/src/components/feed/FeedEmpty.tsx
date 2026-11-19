import { SearchXIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type FeedEmptyProps = {
  /** Present only while a filter is active, since there is nothing to clear otherwise. */
  onClearFilters?: () => void;
};

export function FeedEmpty({ onClearFilters }: FeedEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <SearchXIcon className="text-muted-foreground size-8" aria-hidden="true" />
      <div>
        <p className="font-medium">No stories match</p>
        <p className="text-muted-foreground mt-1">Try fewer filters or a different search.</p>
      </div>
      {onClearFilters && (
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
