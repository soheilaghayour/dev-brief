export type Features = {
  clusters: boolean;
  summaries: boolean;
  copilot: boolean;
  collections: boolean;
};

export type FeatureFlag = keyof Features;

// Literal reads, not Zod: next.config.ts validates the values at build time and inlines them through its `env` option, which replaces only `process.env.FEATURE_*` written out.
export const FEATURES: Features = {
  clusters: process.env.FEATURE_CLUSTERS === 'true',
  summaries: process.env.FEATURE_SUMMARIES === 'true',
  copilot: process.env.FEATURE_COPILOT === 'true',
  collections: process.env.FEATURE_COLLECTIONS === 'true',
};

export function isFeatureEnabled(flag: FeatureFlag, features: Features = FEATURES) {
  return features[flag];
}
