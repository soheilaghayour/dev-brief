import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from './common/common.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { FeedModule } from './modules/feed/feed.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';
import { IngestionScheduler } from './modules/ingestion/ingestion.scheduler.js';
import { MaintenanceModule } from './modules/maintenance/maintenance.module.js';
import { RankingModule } from './modules/ranking/ranking.module.js';
import { SourcesModule } from './modules/sources/sources.module.js';
import { StoriesModule } from './modules/stories/stories.module.js';
import { TagsModule } from './modules/tags/tags.module.js';

@Module({
  imports: [
    CommonModule,
    PrismaModule,
    HealthModule,
    FeedModule,
    StoriesModule,
    SourcesModule,
    TagsModule,
    IngestionModule,
    RankingModule,
    MaintenanceModule,
    ScheduleModule.forRoot(),
  ],
  providers: [IngestionScheduler],
})
export class AppModule {}
