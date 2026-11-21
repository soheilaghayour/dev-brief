import { Reflector } from '@nestjs/core';
import type { Env } from '../env/env.module.js';

/** The env variable that switches each API feature flag on. */
export const FEATURE_ENV = {
  summaries: 'FEATURE_SUMMARIES',
  clusters: 'FEATURE_CLUSTERS',
  copilot: 'FEATURE_COPILOT',
  collections: 'FEATURE_COLLECTIONS',
} as const satisfies Record<string, keyof Env>;

/** Puts a route or controller behind a feature flag; FeatureGuard answers 404 FEATURE_DISABLED while it is off. */
export const RequiresFeature = Reflector.createDecorator<keyof typeof FEATURE_ENV>();
