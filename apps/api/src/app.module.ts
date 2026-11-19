import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from './common/common.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';
import { IngestionScheduler } from './modules/ingestion/ingestion.scheduler.js';

@Module({
  imports: [CommonModule, PrismaModule, HealthModule, IngestionModule, ScheduleModule.forRoot()],
  providers: [IngestionScheduler],
})
export class AppModule {}
