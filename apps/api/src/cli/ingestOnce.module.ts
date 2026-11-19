import 'reflect-metadata';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module.js';
import { IngestionModule } from '../modules/ingestion/ingestion.module.js';
import { IngestionService } from '../modules/ingestion/ingestion.service.js';

// The scheduler is left out so the CLI doesn't also run boot tasks.
@Module({ imports: [PrismaModule, IngestionModule] })
export class IngestOnceModule {}

/** Runs one ingestion in the given application context and returns its overall status. */
export async function runIngestOnce(app: INestApplicationContext) {
  const { runId, status } = await app.get(IngestionService).run();
  console.log(`Ingestion run ${runId} finished: ${status}`);
  return status;
}
