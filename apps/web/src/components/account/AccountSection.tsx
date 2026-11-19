'use client';

import { useState } from 'react';
import type { Me } from '@devbrief/shared';
import { Button } from '@/components/ui/Button';
import { useSignOut } from '@/lib/auth/useSignOut';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { UserAvatar } from './UserAvatar';

const PROVIDER_LABELS = { github: 'GitHub', google: 'Google' } as const satisfies Record<
  Me['providers'][number],
  string
>;

export function AccountSection({ user }: { user: Me }) {
  const signOut = useSignOut();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  function openDelete() {
    setIsDeleteOpen(true);
  }

  function handleSignOut() {
    void signOut();
  }

  return (
    <section aria-labelledby="account-heading" className="flex flex-col gap-3">
      <h2 id="account-heading" className="text-sm font-medium">
        Account
      </h2>
      <div className="flex items-center gap-3">
        <UserAvatar user={user} className="size-10" />
        <div className="min-w-0">
          <p className="truncate font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-sm">{user.email}</p>
        </div>
      </div>
      <p className="text-sm">
        Linked providers:{' '}
        {user.providers.length > 0
          ? user.providers.map((provider) => PROVIDER_LABELS[provider]).join(', ')
          : 'none'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
        <Button variant="destructive" onClick={openDelete}>
          Delete account…
        </Button>
      </div>
      <DeleteAccountDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} />
    </section>
  );
}
