'use client';

import { lazy, Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import { BadgeButton } from '@/components/ui/Badge';
import type { PreferenceKind, PreferenceValue } from '@/lib/guest/preferences';

// Radix's dropdown and the preferences hook are fetched on the first open, keeping them out of first-load JS.
const PreferenceMenuDropdown = lazy(() =>
  import('./PreferenceMenuDropdown').then((module) => ({ default: module.PreferenceMenuDropdown })),
);

type PreferenceMenuProps<K extends PreferenceKind> = {
  kind: K;
  value: PreferenceValue[K];
  /** The name the menu is headed with: a tag's or a source's display name. */
  label: string;
  variant: 'secondary' | 'outline';
  /** What the badge shows. */
  children: ReactNode;
  /** The badge's data attributes, kept on the trigger. */
  data: Record<`data-${string}`, string>;
};

/** A tag or source badge that opens Follow / Mute; the menu loads when first opened. */
export function PreferenceMenu<K extends PreferenceKind>({
  kind,
  value,
  label,
  variant,
  children,
  data,
}: PreferenceMenuProps<K>) {
  const [hasOpened, setHasOpened] = useState(false);

  function open() {
    setHasOpened(true);
  }

  // Also the Suspense fallback, so the badge stays in place while the menu's chunk loads.
  const trigger = (
    <BadgeButton
      variant={variant}
      aria-haspopup="menu"
      title="Follow or mute"
      onClick={open}
      {...data}
    >
      {children}
    </BadgeButton>
  );

  if (!hasOpened) return trigger;
  return (
    <Suspense fallback={trigger}>
      <PreferenceMenuDropdown kind={kind} value={value} label={label} trigger={trigger} />
    </Suspense>
  );
}
