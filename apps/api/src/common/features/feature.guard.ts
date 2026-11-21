import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENV, type Env } from '../env/env.module.js';
import { ApiException } from '../errors/api.exception.js';
import { FEATURE_ENV, RequiresFeature } from './requiresFeature.decorator.js';

/** Answers 404 FEATURE_DISABLED on a `@RequiresFeature` route whose feature flag is off. */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext) {
    const feature = this.reflector.getAllAndOverride(RequiresFeature, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature || this.env[FEATURE_ENV[feature]]) return true;
    throw new ApiException('FEATURE_DISABLED', 'This feature is not enabled.');
  }
}
