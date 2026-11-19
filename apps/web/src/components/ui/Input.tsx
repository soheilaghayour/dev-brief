import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input bg-background placeholder:text-muted-foreground h-8 w-full min-w-0 rounded-md border px-3 text-sm transition-colors disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
