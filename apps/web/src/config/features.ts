export type Features = {
  clusters: boolean;
  summaries: boolean;
  preferences: boolean;
  copilot: boolean;
  radar: boolean;
  collections: boolean;
};

export type FeatureFlag = keyof Features;

export type FeatureEnv = {
  NEXT_PUBLIC_FEATURE_SUMMARIES?: string;
  NEXT_PUBLIC_FEATURE_PREFERENCES?: string;
};

/** The phase flags for a build env: `'true'` turns a wired flag on, anything else leaves it off. */
export function featuresFromEnv(env: FeatureEnv): Features {
  // No Zod here, unlike env.ts: this module is in every app route's first-load JS, and `=== 'true'` leaves nothing invalid to reject.
  return {
    clusters: false,
    summaries: env.NEXT_PUBLIC_FEATURE_SUMMARIES === 'true',
    preferences: env.NEXT_PUBLIC_FEATURE_PREFERENCES === 'true',
    copilot: false,
    radar: false,
    collections: false,
  };
}

// Written out in full: Next inlines only literal `process.env.NEXT_PUBLIC_*` reads into the client bundle.
export const FEATURES = featuresFromEnv({
  NEXT_PUBLIC_FEATURE_SUMMARIES: process.env.NEXT_PUBLIC_FEATURE_SUMMARIES,
  NEXT_PUBLIC_FEATURE_PREFERENCES: process.env.NEXT_PUBLIC_FEATURE_PREFERENCES,
});

export function isFeatureEnabled(flag: FeatureFlag, features: Features = FEATURES) {
  return features[flag];
}
