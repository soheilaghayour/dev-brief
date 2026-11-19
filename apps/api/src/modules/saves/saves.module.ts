import { Module } from '@nestjs/common';
import { UserRateLimitGuard } from './userRateLimit.guard.js';
import { SavesController } from './saves.controller.js';
import { SavesService } from './saves.service.js';

@Module({
  controllers: [SavesController],
  providers: [SavesService, UserRateLimitGuard],
})
export class SavesModule {}
