import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { loadEnv } from '../../env.js';
import { IngestionService } from './ingestion.service.js';

const STALE_AFTER_MINUTES = 60;

/** Triggers ingestion hourly, and on boot when the last good run is stale. */
@Injectable()
export class IngestionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionScheduler.name);

  constructor(private readonly ingestion: IngestionService) {}

  @Cron('5 * * * *', { timeZone: 'UTC' })
  async runHourly() {
    await this.runAndLog();
  }

  // Boot work runs in the background so a slow database never delays the API from listening.
  onApplicationBootstrap() {
    void this.bootTasks();
  }

  async bootTasks() {
    try {
      const retagged = await this.ingestion.retagStaleStories();
      if (retagged > 0) this.logger.log(`Re-tagged ${retagged} stories`);
      if (
        loadEnv().INGEST_ON_BOOT &&
        !(await this.ingestion.hasRecentSuccess(STALE_AFTER_MINUTES))
      ) {
        await this.runAndLog();
      }
    } catch (error) {
      this.logger.error(`Boot tasks failed: ${String(error)}`);
    }
  }

  private async runAndLog() {
    try {
      const { runId, status } = await this.ingestion.run();
      this.logger.log(`Ingestion run ${runId} finished: ${status}`);
    } catch (error) {
      this.logger.error(`Ingestion run failed: ${String(error)}`);
    }
  }
}
