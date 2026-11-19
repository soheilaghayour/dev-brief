import { Suspense } from 'react';
import { SignInOptions } from '@/components/account/SignInOptions';

export const metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <section className="mx-auto flex max-w-sm flex-col gap-4 pt-8">
      <h1 className="text-lg font-semibold tracking-tight">Sign in to DevBrief</h1>
      <p className="text-muted-foreground text-sm">
        Sync your saved stories across devices. No password needed.
      </p>
      {/* useSearchParams needs a boundary so the page itself can stay static. */}
      <Suspense>
        <SignInOptions />
      </Suspense>
    </section>
  );
}
