import { MeSchema } from '@devbrief/shared';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { Env } from '../../common/env/env.module.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { testSignInPlugin } from './testSignIn.plugin.js';

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

/** The OAuth providers a user can sign in with; the `/me` contract is their one home. */
export const SIGN_IN_PROVIDERS = MeSchema.shape.providers.element.options;

type ValidateUserInfo = NonNullable<NonNullable<BetterAuthOptions['user']>['validateUserInfo']>;

/** Refuses to create a user or link an account from an OAuth email its provider has not verified. */
export const rejectUnverifiedOAuthEmail: ValidateUserInfo = ({ user, source }) => {
  if (source.method !== 'oauth' || source.action === 'sign-in' || user.emailVerified === true) {
    return;
  }
  return {
    error: 'email_not_verified',
    errorDescription: 'Verify this email with GitHub or Google first.',
  };
};

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
        // Better Auth adds read:user by default; /user still returns the public profile without it.
        disableDefaultScope: true,
        scope: ['user:email'],
      },
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
    user: {
      // trustedProviders skips Better Auth's own emailVerified check, so this gate enforces it.
      validateUserInfo: rejectUnverifiedOAuthEmail,
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: [...SIGN_IN_PROVIDERS] },
      // The app never calls the providers after sign-in, so a leaked row must not hold usable tokens.
      encryptOAuthTokens: true,
    },
    session: {
      expiresIn: THIRTY_DAYS_IN_SECONDS,
      // Rolling: a session used within the last day is extended to a full 30 days again.
      updateAge: ONE_DAY_IN_SECONDS,
    },
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: 'lax' },
      // Session rows would otherwise store the raw client IP (§8.6).
      ipAddress: { disableIpTracking: true },
      // Better Auth turns both checks off when NODE_ENV=test or TEST is set; they stay on everywhere.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    // /api/auth/* is limited per client IP by authRateLimit.ts, which reads the one trusted proxy hop.
    rateLimit: { enabled: false },
    plugins: env.AUTH_TEST_MODE ? [testSignInPlugin()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
