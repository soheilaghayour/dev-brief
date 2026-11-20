import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  decodeCursor,
  FeedPageSchema,
  FeedQuerySchema,
  StoryLookupRequestSchema,
} from '@devbrief/shared';
import type { FeedQuery, StoryLookupRequest } from '@devbrief/shared';
import { PrivateNoStore, PublicCache } from '../../src/common/cache/cacheControl.js';
import { RequiresFeature } from '../../src/common/features/requiresFeature.decorator.js';
import { Contract } from '../../src/common/zod/contract.decorator.js';
import { ZodPipe } from '../../src/common/zod/zod.pipe.js';

/** Registered only in tests: stands in for real endpoints to exercise the shared conventions. */
@Controller('probe')
export class ProbeController {
  @Get('feed')
  @PublicCache()
  @Contract({ query: FeedQuerySchema, response: FeedPageSchema })
  feed(@Query(new ZodPipe(FeedQuerySchema)) query: FeedQuery) {
    if (query.cursor) decodeCursor(query.cursor, query.sort);
    return { items: [], nextCursor: query.q ?? null };
  }

  @Get('private')
  @PrivateNoStore()
  privateRead() {
    return {};
  }

  @Get('bad-output')
  @Contract({ response: FeedPageSchema })
  badOutput() {
    return { items: 'not a list' };
  }

  @Post('lookup')
  @HttpCode(200)
  @Contract({ body: StoryLookupRequestSchema })
  lookup(@Body(new ZodPipe(StoryLookupRequestSchema)) body: StoryLookupRequest) {
    return { ids: body.ids };
  }

  @Get('summaries')
  @RequiresFeature('summaries')
  summaries() {
    return {};
  }

  @Post('summaries')
  @RequiresFeature('summaries')
  writeSummaries() {
    return {};
  }

  @Get('explode')
  explode(): never {
    throw new Error('secret internal detail: db password hunter2');
  }
}
