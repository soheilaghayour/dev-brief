import { Module } from '@nestjs/common';
import { HttpClient } from '../../common/http/httpClient.js';
import { HnAdapter } from './adapters/hn.adapter.js';
import { IngestionLock } from './ingestion.lock.js';
import { IngestionService } from './ingestion.service.js';
import { IngestionPostRunSteps } from './postRunStep.js';
import { AdapterRegistry, SOURCE_ADAPTERS } from './sourceAdapter.js';

@Module({
  providers: [
    // HttpClient takes optional constructor seams for tests, so Nest can't infer its dependencies.
    { provide: HttpClient, useFactory: () => new HttpClient() },
    HnAdapter,
    { provide: SOURCE_ADAPTERS, useFactory: (hn: HnAdapter) => [hn], inject: [HnAdapter] },
    AdapterRegistry,
    IngestionLock,
    IngestionPostRunSteps,
    IngestionService,
  ],
  exports: [IngestionService, IngestionPostRunSteps],
})
export class IngestionModule {}
