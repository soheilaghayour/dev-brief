import { Button } from '@/components/ui/Button';

/** An inline failure with a button that asks the same question again. */
export function StreamErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="border-destructive/40 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
    >
      <p>{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
