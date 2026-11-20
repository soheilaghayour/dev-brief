import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  MergeRequestSchema,
  MergeResponseSchema,
  PaginationQuerySchema,
  SaveIdsSchema,
  SaveSchema,
  SavedStoryPageSchema,
  StoryIdSchema,
} from '@devbrief/shared';
import type { MergeRequest, PaginationQuery } from '@devbrief/shared';
import { PrivateNoStore } from '../../common/cache/cacheControl.js';
import {
  MUTATIONS_LIMIT,
  UserRateLimit,
  UserRateLimitGuard,
} from '../../common/rate-limit/userRateLimit.guard.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { ZodPipe } from '../../common/zod/zod.pipe.js';
import { AuthGuard, type CurrentUserData } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/currentUser.decorator.js';
import { SavesService } from './saves.service.js';

const MERGE = { bucket: 'merge', perMinute: 10 };

@Controller('me')
@UseGuards(AuthGuard, UserRateLimitGuard)
export class SavesController {
  constructor(private readonly saves: SavesService) {}

  @Get('saves')
  @PrivateNoStore()
  @Contract({ query: PaginationQuerySchema, response: SavedStoryPageSchema })
  list(
    @CurrentUser() user: CurrentUserData,
    @Query(new ZodPipe(PaginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.saves.list(user.id, query);
  }

  @Get('saves/ids')
  @PrivateNoStore()
  @Contract({ response: SaveIdsSchema })
  ids(@CurrentUser() user: CurrentUserData) {
    return this.saves.ids(user.id);
  }

  @Put('saves/:storyId')
  @PrivateNoStore()
  @UserRateLimit(MUTATIONS_LIMIT)
  @Contract({ response: SaveSchema })
  save(
    @CurrentUser() user: CurrentUserData,
    @Param('storyId', new ZodPipe(StoryIdSchema)) storyId: string,
  ) {
    return this.saves.save(user.id, storyId);
  }

  @Delete('saves/:storyId')
  @PrivateNoStore()
  @HttpCode(204)
  @UserRateLimit(MUTATIONS_LIMIT)
  unsave(
    @CurrentUser() user: CurrentUserData,
    @Param('storyId', new ZodPipe(StoryIdSchema)) storyId: string,
  ) {
    return this.saves.unsave(user.id, storyId);
  }

  @Post('merge')
  @PrivateNoStore()
  @HttpCode(200)
  @UserRateLimit(MERGE)
  @Contract({ body: MergeRequestSchema, response: MergeResponseSchema })
  merge(
    @CurrentUser() user: CurrentUserData,
    @Body(new ZodPipe(MergeRequestSchema)) body: MergeRequest,
  ) {
    return this.saves.merge(user.id, body);
  }
}
