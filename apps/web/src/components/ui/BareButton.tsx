import type { ComponentProps } from 'react';

// Static classes, no cva or tailwind-merge: the error boundaries render this so the landing page
// does not load the Button's styling code just for a screen almost nobody sees.
function BareButton(props: ComponentProps<'button'>) {
  return (
    <button
      data-slot="button"
      className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/95"
      {...props}
    />
  );
}

export { BareButton };
