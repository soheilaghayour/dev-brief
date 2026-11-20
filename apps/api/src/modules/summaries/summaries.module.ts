import { Module } from '@nestjs/common';
import { DevtoModule } from '../../common/devto/devto.module.js';
import { HttpClient } from '../../common/http/httpClient.js';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { AutoSummariesStep } from './autoSummaries.step.js';
import { OnDemandSummaryService } from './onDemandSummary.service.js';
import { SummariesController } from './summaries.controller.js';
import { SummariesService } from './summaries.service.js';
import { SummaryInputsService } from './summaryInputs.service.js';

@Module({
  imports: [DevtoModule, IngestionModule, LlmModule],
  controllers: [SummariesController],
  providers: [
    // HttpClient takes optional seams for tests, so Nest can't infer its dependencies.
    { provide: HttpClient, useFactory: () => new HttpClient() },
    SummaryInputsService,
    SummariesService,
    OnDemandSummaryService,
    AutoSummariesStep,
  ],
  exports: [SummariesService],
})
export class SummariesModule {}
