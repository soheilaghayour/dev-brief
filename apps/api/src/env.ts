import { z } from 'zod';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const BooleanFlagSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// Unset keeps the default in modules/llm/budget.ts, the one home of the caps and prices.
const UsdCapSchema = z.preprocess(
  emptyToUndefined,
  z.coerce.number().finite().nonnegative().optional(),
);
const UsdPriceSchema = z.preprocess(
  emptyToUndefined,
  z.coerce.number().finite().positive().optional(),
);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    APP_URL: z.string().url(),
    DATABASE_URL: z.string().url(),
    INTERNAL_API_TOKEN: z.string().min(16),
    INGEST_ON_BOOT: BooleanFlagSchema,
    /** Lets `db:seed:e2e` wipe a database whose name does not mark it as a test one. */
    ALLOW_DESTRUCTIVE_SEED: z
      .enum(['0', '1'])
      .default('0')
      .transform((value) => value === '1'),
    APP_VERSION: z.string().min(1).default('dev'),
    /** Sentry project DSN; unset (or empty) turns error reporting off. */
    SENTRY_DSN: z.preprocess((value) => value || undefined, z.string().url().optional()),
    BETTER_AUTH_SECRET: z.string().min(32),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    AUTH_TEST_MODE: BooleanFlagSchema,
    FEATURE_SUMMARIES: BooleanFlagSchema,
    FEATURE_PREFERENCES: BooleanFlagSchema,
    /** Anthropic key; required once an LLM feature flag is on. */
    ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    LLM_MODEL: z.string().min(1).default('claude-haiku-5-5'),
    LLM_CAP_SUMMARY_AUTO_USD_DAY: UsdCapSchema,
    LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY: UsdCapSchema,
    LLM_CAP_COPILOT_USD_DAY: UsdCapSchema,
    LLM_CAP_GLOBAL_USD_DAY: UsdCapSchema,
    LLM_PRICE_INPUT_PER_MTOK: UsdPriceSchema,
    LLM_PRICE_OUTPUT_PER_MTOK: UsdPriceSchema,
  })
  // Dev and CI run without a key; an enabled LLM feature must not boot without one.
  .refine((env) => !env.FEATURE_SUMMARIES || env.ANTHROPIC_API_KEY !== undefined, {
    path: ['ANTHROPIC_API_KEY'],
    message: 'is required when FEATURE_SUMMARIES=true',
  })
  // Fails closed on the public origin too: an unset NODE_ENV defaults to development.
  .refine(
    (env) =>
      !env.AUTH_TEST_MODE ||
      (env.NODE_ENV !== 'production' && LOOPBACK_HOSTS.has(new URL(env.APP_URL).hostname)),
    {
      path: ['AUTH_TEST_MODE'],
      message:
        'may be true only outside production with a loopback APP_URL (localhost, 127.0.0.1, ::1)',
    },
  );

/** Parses the environment and throws one readable error listing every invalid variable. */
export function loadEnv(source: Record<string, string | undefined> = process.env) {
  const result = EnvSchema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment:\n${problems.join('\n')}`);
}
