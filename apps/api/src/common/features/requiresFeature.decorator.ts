import { Reflector } from '@nestjs/core';
import type { Env } from '../env/env.module.js';

/** The env variable that switches each API phase flag on. */
export const FEATURE_ENV = {
  summaries: 'FEATURE_SUMMARIES',
  preferences: 'FEATURE_PREFERENCES',
} as const satisfies Record<string, keyof Env>;

export type Feature = keyof typeof FEATURE_ENV;

/** Puts a route or controller behind a phase flag; FeatureGuard answers 404 FEATURE_DISABLED while it is off. */
export const RequiresFeature = Reflector.createDecorator<Feature>();
