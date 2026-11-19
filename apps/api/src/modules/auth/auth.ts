import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { Env } from '../../common/env/env.module.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { testSignInPlugin } from './testSignIn.plugin.js';

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

/** Creates the Better Auth instance: OAuth-only sign-in, DB sessions in secure host-only cookies. */
export function createAuth(env: Env, prisma: PrismaClient) {
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        scope: ['user:email'],
      },
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ['github', 'google'] },
    },
    session: {
      expiresIn: THIRTY_DAYS_IN_SECONDS,
      // Rolling: a session used within the last day is extended to a full 30 days again.
      updateAge: ONE_DAY_IN_SECONDS,
    },
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: 'lax' },
    },
    // /api/auth/* is limited per client IP by authRateLimit.ts, which reads the one trusted proxy hop.
    rateLimit: { enabled: false },
    plugins: env.AUTH_TEST_MODE ? [testSignInPlugin()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
