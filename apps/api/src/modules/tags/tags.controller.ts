import { Controller, Get } from '@nestjs/common';
import { TagListSchema } from '@devbrief/shared';
import { PublicCache } from '../../common/cache/cacheControl.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { TagsService } from './tags.service.js';

@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @PublicCache()
  @Contract({ response: TagListSchema })
  list() {
    return this.tags.list();
  }
}
