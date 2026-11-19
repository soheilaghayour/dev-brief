import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    APP_URL: z.string().url(),
    DATABASE_URL: z.string().url(),
    INTERNAL_API_TOKEN: z.string().min(16),
    INGEST_ON_BOOT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    /** Lets `db:seed:e2e` wipe a database whose name does not mark it as a test one. */
    ALLOW_DESTRUCTIVE_SEED: z
      .enum(['0', '1'])
      .default('0')
      .transform((value) => value === '1'),
    APP_VERSION: z.string().min(1).default('dev'),
    BETTER_AUTH_SECRET: z.string().min(32),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    AUTH_TEST_MODE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .refine((env) => !(env.AUTH_TEST_MODE && env.NODE_ENV === 'production'), {
    path: ['AUTH_TEST_MODE'],
    message: 'must not be true when NODE_ENV is production',
  });

/** Parses the environment and throws one readable error listing every invalid variable. */
export function loadEnv(source: Record<string, string | undefined> = process.env) {
  const result = EnvSchema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment:\n${problems.join('\n')}`);
}
