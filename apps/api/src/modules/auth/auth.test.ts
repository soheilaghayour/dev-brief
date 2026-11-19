import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../env.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import { createAuth, rejectUnverifiedOAuthEmail } from './auth.js';

const env = loadEnv({
  APP_URL: 'https://devbrief.example',
  DATABASE_URL: 'postgresql://devbrief:devbrief@localhost:5432/devbrief',
  INTERNAL_API_TOKEN: 'local-internal-token',
  BETTER_AUTH_SECRET: 'local-dev-better-auth-secret-0123456789',
  GITHUB_CLIENT_ID: 'github-id',
  GITHUB_CLIENT_SECRET: 'github-secret',
  GOOGLE_CLIENT_ID: 'google-id',
  GOOGLE_CLIENT_SECRET: 'google-secret',
});
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
const { options } = createAuth(env, prisma);
// The validator never reads Better Auth's endpoint context.
const endpointContext = {} as Parameters<typeof rejectUnverifiedOAuthEmail>[1];

describe('the Better Auth configuration', () => {
  it('AC-1.5.3 links accounts with the same verified email across GitHub and Google', () => {
    expect(options.account?.accountLinking).toEqual({
      enabled: true,
      trustedProviders: ['github', 'google'],
    });
    expect(options.user?.validateUserInfo).toBe(rejectUnverifiedOAuthEmail);
  });

  it('AC-1.5.3 refuses to link or create a user from an unverified provider email', () => {
    const oauth = (action: 'create-user' | 'link-account' | 'sign-in') => ({
      method: 'oauth',
      oauth: { providerId: 'github' },
      action,
    });
    const verdict = (emailVerified: boolean, action: Parameters<typeof oauth>[0]) =>
      rejectUnverifiedOAuthEmail(
        { user: { emailVerified }, source: oauth(action) },
        endpointContext,
      );
    expect(verdict(false, 'link-account')).toMatchObject({ error: 'email_not_verified' });
    expect(verdict(false, 'create-user')).toMatchObject({ error: 'email_not_verified' });
    expect(verdict(true, 'link-account')).toBeUndefined();
    expect(verdict(true, 'create-user')).toBeUndefined();
    // A returning user's linked account is not re-judged.
    expect(verdict(false, 'sign-in')).toBeUndefined();
  });

  it('AC-1.5.1 offers only GitHub and Google, and no email/password', () => {
    expect(Object.keys(options.socialProviders ?? {}).sort()).toEqual(['github', 'google']);
    expect(options.emailAndPassword?.enabled).toBe(false);
  });

  it('AC-1.5.2 uses 30-day rolling sessions in Secure host-only cookies trusting only APP_URL', () => {
    expect(options.session?.expiresIn).toBe(60 * 60 * 24 * 30);
    expect(options.session?.updateAge).toBeLessThan(options.session?.expiresIn ?? 0);
    expect(options.advanced?.defaultCookieAttributes).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
    expect(options.advanced).not.toHaveProperty('crossSubDomainCookies');
    expect(options.baseURL).toBe(env.APP_URL);
    expect(options.trustedOrigins).toEqual([env.APP_URL]);
  });
});
