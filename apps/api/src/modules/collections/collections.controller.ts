import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  CollectionCreateSchema,
  CollectionDetailSchema,
  CollectionIdSchema,
  CollectionItemPutSchema,
  CollectionListSchema,
  CollectionSchema,
  CollectionUpdateSchema,
  StoryIdSchema,
} from '@devbrief/shared';
import type { CollectionCreate, CollectionItemPut, CollectionUpdate } from '@devbrief/shared';
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
import { CollectionsService } from './collections.service.js';

const collectionId = () => Param('id', new ZodPipe(CollectionIdSchema));
const storyId = () => Param('storyId', new ZodPipe(StoryIdSchema));

@Controller('me/collections')
@RequiresFeature('collections')
@UseGuards(AuthGuard, UserRateLimitGuard)
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  @PrivateNoStore()
  @Contract({ response: CollectionListSchema })
  list(@CurrentUser() user: CurrentUserData) {
    return this.collections.list(user.id);
  }

  @Post()
  @PrivateNoStore()
  @UserRateLimit(MUTATIONS_LIMIT)
  @Contract({ body: CollectionCreateSchema, response: CollectionSchema })
  create(
    @CurrentUser() user: CurrentUserData,
    @Body(new ZodPipe(CollectionCreateSchema)) body: CollectionCreate,
  ) {
    return this.collections.create(user.id, body);
  }

  @Get(':id')
  @PrivateNoStore()
  @Contract({ response: CollectionDetailSchema })
  detail(@CurrentUser() user: CurrentUserData, @collectionId() id: string) {
    return this.collections.detail(user.id, id);
  }

  @Patch(':id')
  @PrivateNoStore()
  @UserRateLimit(MUTATIONS_LIMIT)
  @Contract({ body: CollectionUpdateSchema, response: CollectionSchema })
  update(
    @CurrentUser() user: CurrentUserData,
    @collectionId() id: string,
    @Body(new ZodPipe(CollectionUpdateSchema)) body: CollectionUpdate,
  ) {
    return this.collections.update(user.id, id, body);
  }

  @Delete(':id')
  @PrivateNoStore()
  @HttpCode(204)
  @UserRateLimit(MUTATIONS_LIMIT)
  remove(@CurrentUser() user: CurrentUserData, @collectionId() id: string) {
    return this.collections.remove(user.id, id);
  }

  @Put(':id/items/:storyId')
  @PrivateNoStore()
  @UserRateLimit(MUTATIONS_LIMIT)
  @Contract({ body: CollectionItemPutSchema, response: CollectionSchema })
  putItem(
    @CurrentUser() user: CurrentUserData,
    @collectionId() id: string,
    @storyId() story: string,
    @Body(new ZodPipe(CollectionItemPutSchema)) body: CollectionItemPut,
  ) {
    return this.collections.putItem(user.id, id, story, body);
  }

  @Delete(':id/items/:storyId')
  @PrivateNoStore()
  @HttpCode(204)
  @UserRateLimit(MUTATIONS_LIMIT)
  removeItem(
    @CurrentUser() user: CurrentUserData,
    @collectionId() id: string,
    @storyId() story: string,
  ) {
    return this.collections.removeItem(user.id, id, story);
  }
}
