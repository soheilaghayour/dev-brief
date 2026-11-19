'use client';

import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { authClient } from '@/lib/auth/authClient';
import { safeCallbackUrl } from '@/lib/auth/safeCallbackUrl';

const PROVIDERS = [
  { id: 'github', label: 'Continue with GitHub' },
  { id: 'google', label: 'Continue with Google' },
] as const;

export function SignInOptions() {
  const callbackURL = safeCallbackUrl(useSearchParams().get('callbackURL'));

  async function signInWith(provider: (typeof PROVIDERS)[number]['id']) {
    const { error } = await authClient.signIn.social({ provider, callbackURL });
    if (error) toast.error('Could not start sign-in. Try again.');
  }

  return (
    <div className="flex flex-col gap-3">
      {PROVIDERS.map(({ id, label }) => (
        <Button key={id} variant="outline" size="lg" onClick={() => void signInWith(id)}>
          {label}
        </Button>
      ))}
    </div>
  );
}
