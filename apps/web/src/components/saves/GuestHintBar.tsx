'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { signInHref } from './signInHref';
import { useGuestHint } from './useGuestHint';

export function GuestHintBar() {
  const hint = useGuestHint();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  if (!hint.isVisible) return null;

  return (
    <section
      aria-label="Guest hint"
      className="bg-accent/50 text-muted-foreground mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-xs"
    >
      <p className="flex-1">
        You&apos;re browsing as a guest. Saves stay on this device.{' '}
        <Link
          href={signInHref(search ? `${pathname}?${search}` : pathname)}
          prefetch={false}
          className="text-foreground underline"
        >
          Sign in
        </Link>{' '}
        to sync anywhere.
      </p>
      <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={hint.dismiss}>
        <XIcon aria-hidden="true" />
      </Button>
    </section>
  );
}
