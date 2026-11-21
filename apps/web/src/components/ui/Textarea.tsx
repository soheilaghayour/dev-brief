import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input bg-background placeholder:text-muted-foreground min-h-28 w-full min-w-0 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
