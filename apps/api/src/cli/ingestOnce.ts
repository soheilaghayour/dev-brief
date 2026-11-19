import 'reflect-metadata';
import { pathToFileURL } from 'node:url';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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

async function main() {
  const app = await NestFactory.createApplicationContext(IngestOnceModule);
  try {
    const status = await runIngestOnce(app);
    process.exitCode = status === 'failed' ? 1 : 0;
  } finally {
    await app.close();
  }
}

// Importing the file (from a test) must not start a run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
