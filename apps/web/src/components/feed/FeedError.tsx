import { TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type FeedErrorProps = {
  message: string;
  onRetry: () => void;
};

export function FeedError({ message, onRetry }: FeedErrorProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <TriangleAlertIcon className="text-destructive size-6" aria-hidden="true" />
      <p className="text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
