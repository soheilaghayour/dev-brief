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

/** The items whose phase flag is on, or that have none: the way flagged UI stays out of the HTML. */
export function enabledItems<Item extends { flag?: FeatureFlag }>(
  items: readonly Item[],
  features: Features = FEATURES,
) {
  return items.filter((item) => !item.flag || isFeatureEnabled(item.flag, features));
}
