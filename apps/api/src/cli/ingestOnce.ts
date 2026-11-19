import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { IngestOnceModule, runIngestOnce } from './ingestOnce.module.js';

const app = await NestFactory.createApplicationContext(IngestOnceModule);
try {
  const status = await runIngestOnce(app);
  process.exitCode = status === 'failed' ? 1 : 0;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await app.close();
}
