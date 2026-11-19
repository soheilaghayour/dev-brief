import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { IngestionScheduler } from './ingestion.scheduler.js';
import type { IngestionService } from './ingestion.service.js';

function schedulerWith({ recentSuccess }: { recentSuccess: boolean }) {
  const ingestion = {
    retagStaleStories: vi.fn(async () => 0),
    hasRecentSuccess: vi.fn(async () => recentSuccess),
    run: vi.fn(async () => ({ runId: 'r', status: 'success' as const })),
  };
  const scheduler = new IngestionScheduler(ingestion as unknown as IngestionService);
  return { scheduler, ingestion };
}

describe('IngestionScheduler', () => {
  it('AC-1.2.1 schedules the hourly run at minute 5 in UTC', () => {
    const options = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      IngestionScheduler.prototype.runHourly,
    ) as { cronTime: string; timeZone: string };
    expect(options).toMatchObject({ cronTime: '5 * * * *', timeZone: 'UTC' });
  });

  it('AC-1.2.1 runs on boot when INGEST_ON_BOOT is true and the last good run is stale', async () => {
    vi.stubEnv('INGEST_ON_BOOT', 'true');
    try {
      const { scheduler, ingestion } = schedulerWith({ recentSuccess: false });
      await scheduler.bootTasks();
      expect(ingestion.hasRecentSuccess).toHaveBeenCalledWith(60);
      expect(ingestion.run).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('AC-1.2.1 skips the boot run when the last good run is recent', async () => {
    vi.stubEnv('INGEST_ON_BOOT', 'true');
    try {
      const { scheduler, ingestion } = schedulerWith({ recentSuccess: true });
      await scheduler.bootTasks();
      expect(ingestion.run).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('AC-1.2.1 does not run on boot when INGEST_ON_BOOT is false, but still re-tags', async () => {
    vi.stubEnv('INGEST_ON_BOOT', 'false');
    try {
      const { scheduler, ingestion } = schedulerWith({ recentSuccess: false });
      await scheduler.bootTasks();
      expect(ingestion.run).not.toHaveBeenCalled();
      expect(ingestion.retagStaleStories).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
