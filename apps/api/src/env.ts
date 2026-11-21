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
    /** Registers the cron jobs (hourly ingestion, daily maintenance); unset means on in production and off elsewhere. */
    INGEST_SCHEDULE: z.enum(['true', 'false']).optional(),
    /** Lets `db:seed:e2e` wipe a database whose name does not mark it as a test one. */
    ALLOW_DESTRUCTIVE_SEED: z
      .enum(['0', '1'])
      .default('0')
      .transform((value) => value === '1'),
    APP_VERSION: z.string().min(1).default('dev'),
    /** Sentry project DSN; unset (or empty) turns error reporting off. */
    SENTRY_DSN: z.preprocess(emptyToUndefined, z.string().url().optional()),
    BETTER_AUTH_SECRET: z.string().min(32),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    /** Fine-grained token for the GitHub Search source; unset (or empty) skips that source. */
    GITHUB_TOKEN: z.preprocess((value) => value || undefined, z.string().optional()),
    AUTH_TEST_MODE: BooleanFlagSchema,
    FEATURE_SUMMARIES: BooleanFlagSchema,
    FEATURE_PREFERENCES: BooleanFlagSchema,
    FEATURE_CLUSTERS: BooleanFlagSchema,
    FEATURE_COPILOT: BooleanFlagSchema,
    FEATURE_RADAR: BooleanFlagSchema,
    FEATURE_COLLECTIONS: BooleanFlagSchema,
    /** Summarises the top stories after each ingestion run; takes effect only with FEATURE_SUMMARIES. */
    AUTO_SUMMARIES: BooleanFlagSchema,
    /** Clusters the new stories after each ingestion run; takes effect only with FEATURE_CLUSTERS. */
    AUTO_CLUSTERING: BooleanFlagSchema,
    /** Derives the daily salt of the stored IP digests (PRD §8.6); required when FEATURE_SUMMARIES=true. */
    IP_HASH_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
    ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    LLM_MODEL: z.string().min(1).default('claude-haiku-5-5'),
    LLM_CAP_SUMMARY_AUTO_USD_DAY: UsdCapSchema,
    LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY: UsdCapSchema,
    LLM_CAP_CLUSTER_USD_DAY: UsdCapSchema,
    LLM_CAP_COPILOT_USD_DAY: UsdCapSchema,
    LLM_CAP_GLOBAL_USD_DAY: UsdCapSchema,
    LLM_PRICE_INPUT_PER_MTOK: UsdPriceSchema,
    LLM_PRICE_OUTPUT_PER_MTOK: UsdPriceSchema,
  })
  // Dev and CI run without a key; an enabled LLM feature must not boot without one.
  .refine(
    (env) =>
      !(env.FEATURE_SUMMARIES || env.FEATURE_CLUSTERS || env.FEATURE_COPILOT) ||
      env.ANTHROPIC_API_KEY !== undefined,
    {
      path: ['ANTHROPIC_API_KEY'],
      message:
        'is required when FEATURE_SUMMARIES=true, FEATURE_CLUSTERS=true or FEATURE_COPILOT=true',
    },
  )
  // Summary and copilot quotas both hash client IPs.
  .refine(
    (env) => !(env.FEATURE_SUMMARIES || env.FEATURE_COPILOT) || env.IP_HASH_SECRET !== undefined,
    {
      path: ['IP_HASH_SECRET'],
      message: 'is required when FEATURE_SUMMARIES=true or FEATURE_COPILOT=true',
    },
  )
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
  )
  .transform((env) => ({
    ...env,
    INGEST_SCHEDULE: env.INGEST_SCHEDULE
      ? env.INGEST_SCHEDULE === 'true'
      : env.NODE_ENV === 'production',
  }));

/** Parses the environment and throws one readable error listing every invalid variable. */
export function loadEnv(source: Record<string, string | undefined> = process.env) {
  const result = EnvSchema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment:\n${problems.join('\n')}`);
}
