import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  StoryDetailSchema,
  StoryIdSchema,
  StoryLookupRequestSchema,
  StoryLookupResponseSchema,
} from '@devbrief/shared';
import type { StoryLookupRequest } from '@devbrief/shared';
import { PublicCache } from '../../common/cache/cacheControl.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { ZodPipe } from '../../common/zod/zod.pipe.js';
import { StoriesService } from './stories.service.js';

@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Post('lookup')
  @HttpCode(200)
  @Contract({ body: StoryLookupRequestSchema, response: StoryLookupResponseSchema })
  lookup(@Body(new ZodPipe(StoryLookupRequestSchema)) body: StoryLookupRequest) {
    return this.stories.lookup(body.ids);
  }

  @Get(':id')
  @PublicCache()
  @Contract({ response: StoryDetailSchema })
  detail(@Param('id', new ZodPipe(StoryIdSchema)) id: string) {
    return this.stories.getDetail(id);
  }
}
