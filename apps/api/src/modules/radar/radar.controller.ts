import { Controller, Get, Query } from '@nestjs/common';
import { RadarQuerySchema, RadarSchema } from '@devbrief/shared';
import type { RadarQuery } from '@devbrief/shared';
import { PublicCache } from '../../common/cache/cacheControl.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { ZodPipe } from '../../common/zod/zod.pipe.js';
import { RadarService } from './radar.service.js';

@Controller('radar')
export class RadarController {
  constructor(private readonly radar: RadarService) {}

  @Get()
  @PublicCache()
  @Contract({ query: RadarQuerySchema, response: RadarSchema })
  get(@Query(new ZodPipe(RadarQuerySchema)) query: RadarQuery) {
    return this.radar.get(query);
  }
}
