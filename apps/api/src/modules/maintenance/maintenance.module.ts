import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { MaintenanceService } from './maintenance.service.js';
import { TagStatsService } from './tagStats.service.js';

@Module({ imports: [IngestionModule], providers: [MaintenanceService, TagStatsService] })
export class MaintenanceModule {}
