import { Module } from '@nestjs/common';
import { HttpClient } from '../http/httpClient.js';
import { DevtoClient } from './devtoClient.js';

/** Provides the one DevtoClient, so ingestion and summaries share its queue. */
@Module({
  providers: [
    // DevtoClient and HttpClient take optional seams for tests, so Nest can't infer their dependencies.
    { provide: DevtoClient, useFactory: () => new DevtoClient(new HttpClient()) },
  ],
  exports: [DevtoClient],
})
export class DevtoModule {}
