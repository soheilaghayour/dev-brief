'use client';

import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { Me } from '@devbrief/shared';
import { Button } from '@/components/ui/Button';
import { authClient } from '@/lib/auth/authClient';
import { safeCallbackUrl } from '@/lib/auth/safeCallbackUrl';
import { PROVIDER_LABELS } from './providerLabels';

type Provider = Me['providers'][number];

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];

// Better Auth appends `?error=<code>` to errorCallbackURL when the provider round trip fails.
const SIGN_IN_ERRORS: Record<string, string> = {
  email_not_verified: 'Verify your email with GitHub or Google first, then try again.',
};
const DEFAULT_SIGN_IN_ERROR = 'Sign-in did not complete. Try again.';

export function SignInOptions() {
  const searchParams = useSearchParams();
  const callbackURL = safeCallbackUrl(searchParams.get('callbackURL'));
  const errorCode = searchParams.get('error');
  // A cancelled or refused sign-in comes back here, inside the app, instead of Better Auth's bare error page.
  const errorCallbackURL = `/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`;

  async function signInWith(provider: Provider) {
    const { error } = await authClient.signIn.social({ provider, callbackURL, errorCallbackURL });
    if (error) toast.error('Could not start sign-in. Try again.');
  }

  return (
    <div className="flex flex-col gap-3">
      {errorCode && (
        <p role="alert" className="text-destructive text-sm">
          {SIGN_IN_ERRORS[errorCode] ?? DEFAULT_SIGN_IN_ERROR}
        </p>
      )}
      {PROVIDERS.map((provider) => (
        <Button
          key={provider}
          variant="outline"
          size="lg"
          onClick={() => void signInWith(provider)}
        >
          Continue with {PROVIDER_LABELS[provider]}
        </Button>
      ))}
    </div>
  );
}
