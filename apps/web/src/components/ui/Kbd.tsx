import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const kbdVariants = cva(
  'bg-muted text-muted-foreground inline-flex items-center justify-center rounded-sm border px-1 font-mono font-medium',
  {
    variants: {
      size: { default: 'h-5 min-w-5 text-[11px]', sm: 'h-4 min-w-4 text-[10px]' },
    },
    defaultVariants: { size: 'default' },
  },
);

function Kbd({
  className,
  size,
  ...props
}: ComponentProps<'kbd'> & VariantProps<typeof kbdVariants>) {
  return <kbd data-slot="kbd" className={cn(kbdVariants({ size }), className)} {...props} />;
}

export { Kbd };
