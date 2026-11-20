import { Module } from '@nestjs/common';
import { OnDemandSummaryService } from './onDemandSummary.service.js';
import { SummariesController } from './summaries.controller.js';
import { SummariesModule } from './summaries.module.js';

/** The summary routes; only AppModule imports it, so the ingest CLI (which imports SummariesModule) doesn't build Better Auth. */
@Module({
  imports: [SummariesModule],
  controllers: [SummariesController],
  providers: [OnDemandSummaryService],
})
export class SummariesHttpModule {}
