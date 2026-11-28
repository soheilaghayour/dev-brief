import { Controller, Get, Query } from '@nestjs/common';
import { TagListQuerySchema, TagListSchema } from '@devbrief/shared';
import type { TagListQuery } from '@devbrief/shared';
import { PublicCache } from '../../common/cache/cacheControl.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { ZodPipe } from '../../common/zod/zod.pipe.js';
import { TagsService } from './tags.service.js';

@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @PublicCache()
  @Contract({ query: TagListQuerySchema, response: TagListSchema })
  list(@Query(new ZodPipe(TagListQuerySchema)) query: TagListQuery) {
    return this.tags.list(query);
  }
}
