import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  API_INTERNAL_URL: z.string().url(),
  INTERNAL_API_TOKEN: z.string().min(16),
});

/** The public origin for absolute URLs in metadata; `next build` runs without environment, so a missing APP_URL gives the local default. */
export function loadAppOrigin(source: Record<string, string | undefined> = process.env) {
  const appUrl = z.string().url().safeParse(source.APP_URL);
  return new URL(appUrl.success ? appUrl.data : 'http://localhost:3000');
}

/** Parses the environment and throws one readable error listing every invalid variable. */
export function loadEnv(source: Record<string, string | undefined> = process.env) {
  const result = EnvSchema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment:\n${problems.join('\n')}`);
}
