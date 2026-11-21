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
  clusters: process.env.NEXT_PUBLIC_FEATURE_CLUSTERS === 'true',
  summaries: process.env.NEXT_PUBLIC_FEATURE_SUMMARIES === 'true',
  preferences: process.env.NEXT_PUBLIC_FEATURE_PREFERENCES === 'true',
  copilot: process.env.NEXT_PUBLIC_FEATURE_COPILOT === 'true',
  radar: process.env.NEXT_PUBLIC_FEATURE_RADAR === 'true',
  collections: process.env.NEXT_PUBLIC_FEATURE_COLLECTIONS === 'true',
};

export function isFeatureEnabled(flag: FeatureFlag, features: Features = FEATURES) {
  return features[flag];
}
