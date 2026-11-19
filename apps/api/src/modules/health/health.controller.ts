import { Controller, Get } from '@nestjs/common';
import { HealthSchema } from '@devbrief/shared';
import { PrivateNoStore } from '../../common/cache/cacheControl.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // Health must reflect the present state, so no cache serves it.
  @Get()
  @PrivateNoStore()
  @Contract({ response: HealthSchema })
  check() {
    return this.health.check();
  }
}
