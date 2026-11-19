import { BookmarkIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

type SaveButtonProps = {
  isSaved: boolean;
  onToggleSave: () => void;
  /** Shows the word "Save" next to the icon, as on the story page. */
  withLabel?: boolean;
};

export function SaveButton({ isSaved, onToggleSave, withLabel = false }: SaveButtonProps) {
  return (
    <Button
      variant={withLabel ? 'outline' : 'ghost'}
      size={withLabel ? 'default' : 'icon'}
      aria-pressed={isSaved}
      aria-label={withLabel ? undefined : 'Save story'}
      title="Save"
      className={cn('text-muted-foreground', isSaved && 'text-primary')}
      onClick={onToggleSave}
    >
      <BookmarkIcon className={cn(isSaved && 'fill-current')} aria-hidden="true" />
      {withLabel && 'Save'}
    </Button>
  );
}
