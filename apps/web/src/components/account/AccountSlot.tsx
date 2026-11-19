'use client';

import { usePathname } from 'next/navigation';
import { useMe } from '@/lib/auth/useMe';
import { SignInButton } from './SignInButton';
import { UserMenu } from './UserMenu';

/** The header's account area: the user menu when signed in, a sign-in button for guests. */
export function AccountSlot() {
  const { data: user, isPending } = useMe();
  const pathname = usePathname();
  // On /sign-in itself the button would nest the page's own callbackURL inside a new one.
  if (pathname === '/sign-in') return null;
  // Reserves the button's width so the header does not shift when /me answers.
  if (isPending) return <div className="h-7 w-16" aria-hidden />;
  return user ? <UserMenu user={user} /> : <SignInButton />;
}
