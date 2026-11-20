export type Features = {
  clusters: boolean;
  summaries: boolean;
  preferences: boolean;
  copilot: boolean;
  radar: boolean;
  collections: boolean;
};

export type FeatureFlag = keyof Features;

export const FEATURES: Features = {
  clusters: false,
  summaries: false,
  preferences: false,
  copilot: false,
  radar: false,
  collections: false,
};

export function isFeatureEnabled(flag: FeatureFlag, features: Features = FEATURES) {
  return features[flag];
}
