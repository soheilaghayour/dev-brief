import { BookmarkIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type SaveButtonProps = {
  isSaved: boolean;
  onToggleSave: () => void;
  /** Shows the word "Save" next to the icon, as on the story page. */
  withLabel?: boolean;
};

export function SaveButton({ isSaved, onToggleSave, withLabel = false }: SaveButtonProps) {
  return (
    <Button
      variant={withLabel ? 'toggleOutline' : 'toggle'}
      size={withLabel ? 'default' : 'icon'}
      aria-pressed={isSaved}
      aria-label={withLabel ? undefined : 'Save story'}
      title="Save"
      onClick={onToggleSave}
    >
      <BookmarkIcon aria-hidden="true" />
      {withLabel && 'Save'}
    </Button>
  );
}
