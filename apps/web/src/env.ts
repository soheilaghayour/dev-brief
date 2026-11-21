import { z } from 'zod';

type EnvSource = Record<string, string | undefined>;

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  API_INTERNAL_URL: z.string().url(),
  INTERNAL_API_TOKEN: z.string().min(16),
});

const FeatureFlagSchema = z.enum(['true', 'false']).default('false');

const FeatureFlagEnvSchema = z.object({
  FEATURE_SUMMARIES: FeatureFlagSchema,
  FEATURE_CLUSTERS: FeatureFlagSchema,
  FEATURE_COPILOT: FeatureFlagSchema,
  FEATURE_COLLECTIONS: FeatureFlagSchema,
});

/** The public origin for absolute URLs in metadata; `next build` runs without environment, so a missing APP_URL gives the local default. */
export function loadAppOrigin(source: EnvSource = process.env) {
  const appUrl = z.string().url().safeParse(source.APP_URL);
  return new URL(appUrl.success ? appUrl.data : 'http://localhost:3000');
}

/** Parses the environment and throws one readable error listing every invalid variable. */
export function loadEnv(source: EnvSource = process.env) {
  return parseEnv(EnvSchema, source);
}

/** Fails the build on a `FEATURE_*` value other than `'true'` or `'false'`; returns every flag, unset ones as `'false'`, for next.config's `env`. */
export function validateFeatureFlagEnv(source: EnvSource = process.env) {
  return parseEnv(FeatureFlagEnvSchema, source);
}

function parseEnv<Schema extends z.ZodTypeAny>(
  schema: Schema,
  source: EnvSource,
): z.output<Schema> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment:\n${problems.join('\n')}`);
}
