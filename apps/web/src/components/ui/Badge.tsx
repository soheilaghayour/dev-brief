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

// A badge that opens something: the same look, plus the hover of a control.
function BadgeButton({
  className,
  variant,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof badgeVariants>) {
  return (
    <button
      type="button"
      data-slot="badge"
      className={cn(
        badgeVariants({ variant }),
        'hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent',
        className,
      )}
      {...props}
    />
  );
}

export { Badge, BadgeButton };
