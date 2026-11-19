import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn('accent-primary size-3.5 shrink-0 rounded-sm', className)}
      {...props}
    />
  );
}

export { Checkbox };
