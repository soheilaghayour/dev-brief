'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export function SignInButton() {
  const router = useRouter();
  const pathname = usePathname();

  function goToSignIn() {
    // Read at click time: the current URL includes the query, which usePathname omits.
    const currentUrl = window.location.pathname + window.location.search;
    router.push(`/sign-in?callbackURL=${encodeURIComponent(currentUrl)}`);
  }

  // On /sign-in itself the button would nest the page's own callbackURL inside a new one.
  if (pathname === '/sign-in') return null;
  return (
    <Button variant="outline" size="sm" onClick={goToSignIn}>
      Sign in
    </Button>
  );
}
