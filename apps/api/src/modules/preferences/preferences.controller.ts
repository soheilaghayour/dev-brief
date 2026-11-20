import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { PreferencesSchema } from '@devbrief/shared';
import type { Preferences } from '@devbrief/shared';
import { PrivateNoStore } from '../../common/cache/cacheControl.js';
import { RequiresFeature } from '../../common/features/requiresFeature.decorator.js';
import {
  MUTATIONS_LIMIT,
  UserRateLimit,
  UserRateLimitGuard,
} from '../../common/rate-limit/userRateLimit.guard.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { ZodPipe } from '../../common/zod/zod.pipe.js';
import { AuthGuard, type CurrentUserData } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/currentUser.decorator.js';
import { PreferencesService } from './preferences.service.js';

@Controller('me/preferences')
@RequiresFeature('preferences')
@UseGuards(AuthGuard, UserRateLimitGuard)
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @PrivateNoStore()
  @Contract({ response: PreferencesSchema })
  get(@CurrentUser() user: CurrentUserData) {
    return this.preferences.get(user.id);
  }

  @Put()
  @PrivateNoStore()
  @UserRateLimit(MUTATIONS_LIMIT)
  @Contract({ body: PreferencesSchema, response: PreferencesSchema })
  replace(
    @CurrentUser() user: CurrentUserData,
    @Body(new ZodPipe(PreferencesSchema)) body: Preferences,
  ) {
    return this.preferences.replace(user.id, body);
  }
}
