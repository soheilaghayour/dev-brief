import { MeSchema } from '@devbrief/shared';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

const TestSignInBodySchema = z.object({
  email: z.string().email().default('test-user@example.com'),
  name: z.string().min(1).default('Test User'),
  providers: MeSchema.shape.providers.max(2).default(['github']),
});

/** Test-only: signs in a fixture user without OAuth; createAuth registers it only when AUTH_TEST_MODE is on. */
export function testSignInPlugin() {
  return {
    id: 'test-sign-in',
    endpoints: {
      testSignIn: createAuthEndpoint('/test/sign-in', { method: 'POST' }, async (ctx) => {
        const body = TestSignInBodySchema.safeParse(ctx.body ?? {});
        if (!body.success) throw ctx.error('BAD_REQUEST', { message: body.error.message });
        const { email, name, providers } = body.data;
        const { internalAdapter } = ctx.context;
        const existing = await internalAdapter.findUserByEmail(email, { includeAccounts: true });
        const user =
          existing?.user ??
          (await internalAdapter.createUser(
            { email, name, emailVerified: true },
            { method: 'test-sign-in' },
          ));
        // A repeated sign-in must not add a second Account row for a provider the user already has.
        const linked = new Set(existing?.accounts.map((account) => account.providerId));
        for (const providerId of providers.filter((provider) => !linked.has(provider))) {
          await internalAdapter.linkAccount({
            userId: user.id,
            providerId,
            accountId: `${providerId}-${user.id}`,
          });
        }
        const session = await internalAdapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ userId: user.id });
      }),
    },
  } satisfies BetterAuthPlugin;
}
