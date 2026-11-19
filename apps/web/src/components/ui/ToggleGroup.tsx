import type { ComponentProps } from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';

function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn('bg-muted inline-flex items-center gap-0.5 rounded-md border p-0.5', className)}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground inline-flex size-7 items-center justify-center gap-1.5 rounded-sm text-xs font-medium transition-colors data-[state=on]:shadow-sm [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
