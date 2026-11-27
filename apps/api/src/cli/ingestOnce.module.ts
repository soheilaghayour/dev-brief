import 'reflect-metadata';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { CacheModule } from '../common/cache/cache.module.js';
import { EnvModule } from '../common/env/env.module.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';
import { IngestionModule } from '../modules/ingestion/ingestion.module.js';
import { IngestionService } from '../modules/ingestion/ingestion.service.js';
import { MaintenanceModule } from '../modules/maintenance/maintenance.module.js';
import { RankingModule } from '../modules/ranking/ranking.module.js';
import { SummariesModule } from '../modules/summaries/summaries.module.js';

// The scheduler is left out so the CLI doesn't also run boot tasks. Each module that registers a post-run step must be listed: a missing one silently skips its step.
@Module({
  imports: [
    EnvModule,
    PrismaModule,
    CacheModule,
    IngestionModule,
    RankingModule,
    MaintenanceModule,
    SummariesModule,
  ],
})
export class IngestOnceModule {}

/** Runs one ingestion in the given application context and returns its overall status. */
export async function runIngestOnce(app: INestApplicationContext) {
  const { runId, status } = await app.get(IngestionService).run();
  console.log(`Ingestion run ${runId} finished: ${status}`);
  return status;
}
