import { Controller, Get } from '@nestjs/common';
import { StatsSchema } from '@devbrief/shared';
import { PublicCache } from '../../common/cache/cacheControl.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { StatsService } from './stats.service.js';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @PublicCache()
  @Contract({ response: StatsSchema })
  get() {
    return this.stats.get();
  }
}
