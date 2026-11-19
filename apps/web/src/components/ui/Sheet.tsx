import type { ComponentProps } from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col border-r shadow-xl duration-200',
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="text-muted-foreground hover:text-foreground absolute top-3 right-3 rounded-sm p-1 transition-colors">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex h-14 items-center border-b px-4', className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-semibold', className)}
      {...props}
    />
  );
}

function SheetDescription(props: ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" {...props} />;
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription };
