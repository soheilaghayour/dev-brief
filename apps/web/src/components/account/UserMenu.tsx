'use client';

import { lazy, Suspense, useState } from 'react';
import type { Me } from '@devbrief/shared';
import { Button } from '@/components/ui/Button';
import { UserAvatar } from './UserAvatar';

// Radix's dropdown is fetched on the first click, keeping it out of first-load JS.
const UserMenuDropdown = lazy(() =>
  import('./UserMenuDropdown').then((module) => ({ default: module.UserMenuDropdown })),
);

/** The avatar button of a signed-in user; its menu (Settings, Sign out) loads when first opened. */
export function UserMenu({ user }: { user: Me }) {
  const [hasOpened, setHasOpened] = useState(false);

  function open() {
    setHasOpened(true);
  }

  // Also the Suspense fallback, so the header keeps the avatar while the menu's chunk loads.
  const avatarButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Account menu"
      aria-haspopup="menu"
      onClick={open}
    >
      <UserAvatar user={user} />
    </Button>
  );

  if (!hasOpened) return avatarButton;
  return (
    <Suspense fallback={avatarButton}>
      <UserMenuDropdown user={user} />
    </Suspense>
  );
}
