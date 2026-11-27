import { cloneElement, isValidElement } from 'react';
import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/95',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        toggle:
          'text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-pressed:text-primary aria-pressed:[&_svg]:fill-current',
        toggleOutline:
          'border border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-pressed:text-primary aria-pressed:[&_svg]:fill-current',
        segment:
          'rounded-sm text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm',
      },
      size: {
        default: 'h-8 px-3',
        xs: 'h-6 gap-1 px-2 text-xs',
        sm: 'h-7 px-2.5 text-xs',
        lg: 'h-10 px-5',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

// asChild styles the single child element (a link) instead of wrapping it. Radix's Slot would do the
// same but costs ~3 KB gzip in every route's first load, and no child here needs its ref or handler merging.
function Button({ className, variant, size, asChild = false, children, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild && isValidElement<{ className?: string }>(children)) {
    return cloneElement(children, {
      ...props,
      'data-slot': 'button',
      className: cn(classes, children.props.className),
    } as Partial<typeof children.props>);
  }
  return (
    <button data-slot="button" className={classes} {...props}>
      {children}
    </button>
  );
}

export { Button };
