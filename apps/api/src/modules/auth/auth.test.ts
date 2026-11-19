import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../env.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import { createAuth } from './auth.js';

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

describe('the Better Auth configuration', () => {
  it('AC-1.5.3 links accounts with the same verified email across GitHub and Google', () => {
    expect(options.account?.accountLinking).toEqual({
      enabled: true,
      trustedProviders: ['github', 'google'],
    });
  });

  it('AC-1.5.1 offers GitHub with the user:email scope and Google, and no email/password', () => {
    expect(options.socialProviders?.github?.scope).toEqual(['user:email']);
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
