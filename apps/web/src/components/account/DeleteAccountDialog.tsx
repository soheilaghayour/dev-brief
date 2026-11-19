'use client';

import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { deleteMe } from '@/lib/api/endpoints';
import { ME_QUERY_KEY } from '@/lib/auth/useMe';
import { clearGuestData } from '@/lib/guest/clear';

const CONFIRMATION_WORD = 'delete';

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>
            This permanently deletes your account, your sessions and your saved stories. Type{' '}
            <strong>{CONFIRMATION_WORD}</strong> to confirm.
          </DialogDescription>
        </DialogHeader>
        {/* Radix unmounts closed content, so every reopen starts with an empty, unarmed form. */}
        <DeleteAccountForm />
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  function changeTyped(event: ChangeEvent<HTMLInputElement>) {
    setTyped(event.target.value);
  }

  async function deleteAccount() {
    setIsDeleting(true);
    try {
      await deleteMe();
    } catch {
      toast.error('Could not delete your account. Try again.');
      setIsDeleting(false);
      return;
    }
    clearGuestData();
    queryClient.setQueryData(ME_QUERY_KEY, null);
    toast.success('Your account was deleted.');
    router.push('/');
  }

  return (
    <>
      <Input
        aria-label={`Type ${CONFIRMATION_WORD} to confirm`}
        value={typed}
        onChange={changeTyped}
        autoComplete="off"
      />
      <Button
        variant="destructive"
        disabled={typed !== CONFIRMATION_WORD || isDeleting}
        onClick={() => void deleteAccount()}
      >
        Delete my account
      </Button>
    </>
  );
}

type DeleteAccountDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };
