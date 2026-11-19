import { Controller, Get } from '@nestjs/common';
import { SourceListSchema } from '@devbrief/shared';
import { PublicCache } from '../../common/cache/cacheControl.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { SourcesService } from './sources.service.js';

@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  @PublicCache()
  @Contract({ response: SourceListSchema })
  list() {
    return this.sources.list();
  }
}
