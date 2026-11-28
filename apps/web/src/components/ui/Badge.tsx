import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs leading-5 whitespace-nowrap',
  {
    variants: {
      variant: {
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'text-muted-foreground border',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge };
