export type Features = {
  clusters: boolean;
  summaries: boolean;
  preferences: boolean;
  copilot: boolean;
  radar: boolean;
  collections: boolean;
};

export type FeatureFlag = keyof Features;

// Literal reads, not Zod: Next inlines only `process.env.NEXT_PUBLIC_*` written out, and next.config.ts validates the values at build time.
export const FEATURES: Features = {
  clusters: false,
  summaries: process.env.NEXT_PUBLIC_FEATURE_SUMMARIES === 'true',
  preferences: process.env.NEXT_PUBLIC_FEATURE_PREFERENCES === 'true',
  copilot: false,
  radar: false,
  collections: false,
};

export function isFeatureEnabled(flag: FeatureFlag, features: Features = FEATURES) {
  return features[flag];
}
