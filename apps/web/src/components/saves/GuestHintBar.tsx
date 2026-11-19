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
      // Fixed, so showing it after hydration cannot shift the page.
      className="bg-accent text-muted-foreground fixed inset-x-4 bottom-4 z-40 flex items-center gap-2 rounded-md border px-3 py-2 text-xs shadow-sm md:left-auto md:max-w-md"
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
