import { Module } from '@nestjs/common';
import { UserRateLimitGuard } from '../../common/rate-limit/userRateLimit.guard.js';
import { SavesController } from './saves.controller.js';
import { SavesService } from './saves.service.js';

@Module({
  controllers: [SavesController],
  providers: [SavesService, UserRateLimitGuard],
})
export class SavesModule {}
