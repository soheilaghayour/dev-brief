import { Module } from '@nestjs/common';
import { ENV, type Env } from '../../common/env/env.module.js';
import { HttpClient } from '../../common/http/httpClient.js';
import { DevtoAdapter } from './adapters/devto.adapter.js';
import { GithubAdapter } from './adapters/github.adapter.js';
import { HnAdapter } from './adapters/hn.adapter.js';
import { RssAdapter } from './adapters/rss.adapter.js';
import { IngestionLock } from './ingestion.lock.js';
import { IngestionService } from './ingestion.service.js';
import { IngestionPostRunSteps } from './postRunStep.js';
import { AdapterRegistry, SOURCE_ADAPTERS, type SourceAdapter } from './sourceAdapter.js';

@Module({
  providers: [
    // HttpClient takes optional constructor seams for tests, so Nest can't infer its dependencies.
    { provide: HttpClient, useFactory: () => new HttpClient() },
    HnAdapter,
    // These adapters take optional seams (pause, clock) for tests, so Nest can't infer their dependencies.
    {
      provide: DevtoAdapter,
      useFactory: (http: HttpClient) => new DevtoAdapter(http),
      inject: [HttpClient],
    },
    {
      provide: RssAdapter,
      useFactory: (http: HttpClient) => new RssAdapter(http),
      inject: [HttpClient],
    },
    {
      provide: GithubAdapter,
      useFactory: (http: HttpClient, env: Env) => new GithubAdapter(http, env.GITHUB_TOKEN),
      inject: [HttpClient, ENV],
    },
    {
      provide: SOURCE_ADAPTERS,
      useFactory: (...adapters: SourceAdapter[]) => adapters,
      inject: [HnAdapter, DevtoAdapter, RssAdapter, GithubAdapter],
    },
    AdapterRegistry,
    IngestionLock,
    IngestionPostRunSteps,
    IngestionService,
  ],
  exports: [IngestionService, IngestionPostRunSteps],
})
export class IngestionModule {}
