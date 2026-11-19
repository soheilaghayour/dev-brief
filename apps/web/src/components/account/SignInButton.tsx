'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export function SignInButton() {
  const router = useRouter();

  function goToSignIn() {
    // Read at click time: the current URL includes the query, which usePathname omits.
    const currentUrl = window.location.pathname + window.location.search;
    router.push(`/sign-in?callbackURL=${encodeURIComponent(currentUrl)}`);
  }

  return (
    <Button variant="outline" size="sm" onClick={goToSignIn}>
      Sign in
    </Button>
  );
}
