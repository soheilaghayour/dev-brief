import { Controller, Get, Query } from '@nestjs/common';
import { FeedPageSchema, FeedQuerySchema } from '@devbrief/shared';
import type { FeedQuery } from '@devbrief/shared';
import { PublicCache } from '../../common/cache/cacheControl.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { ZodPipe } from '../../common/zod/zod.pipe.js';
import { FeedService } from './feed.service.js';

@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  @PublicCache()
  @Contract({ query: FeedQuerySchema, response: FeedPageSchema })
  page(@Query(new ZodPipe(FeedQuerySchema)) query: FeedQuery) {
    return this.feed.getPage(query);
  }
}
