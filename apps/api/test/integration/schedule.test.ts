import { SchedulerRegistry } from '@nestjs/schedule';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { createTestApp } from './createTestApp.js';
import { useTestDatabase } from './testDatabase.js';

describe('cron registration', () => {
  useTestDatabase();
  let app: Awaited<ReturnType<typeof createTestApp>> | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('registers no scheduler in a test app, even when the process env turns the schedule on', async () => {
    process.env.INGEST_SCHEDULE = 'true';
    try {
      app = await createTestApp();
    } finally {
      delete process.env.INGEST_SCHEDULE;
    }
    expect(() => app!.get(SchedulerRegistry, { strict: false })).toThrow();
  });

  it('imports the schedule module only when INGEST_SCHEDULE is on', () => {
    expect(AppModule.register({ INGEST_SCHEDULE: false }).imports).toEqual([]);
    expect(AppModule.register({ INGEST_SCHEDULE: true }).imports).toHaveLength(1);
  });
});
