'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { Me } from '@devbrief/shared';
import { Button } from '@/components/ui/Button';
import { UserAvatar } from './UserAvatar';

// Radix's dropdown is fetched on the first click, keeping it out of first-load JS.
const UserMenuDropdown = dynamic(() =>
  import('./UserMenuDropdown').then((module) => module.UserMenuDropdown),
);

/** The avatar button of a signed-in user; its menu (Settings, Sign out) loads when first opened. */
export function UserMenu({ user }: { user: Me }) {
  const [hasOpened, setHasOpened] = useState(false);

  function open() {
    setHasOpened(true);
  }

  if (hasOpened) return <UserMenuDropdown user={user} />;
  return (
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
}
