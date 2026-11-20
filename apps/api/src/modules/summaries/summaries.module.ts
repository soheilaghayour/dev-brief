import { Module } from '@nestjs/common';
import { HttpClient } from '../../common/http/httpClient.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { LlmModule } from '../llm/llm.module.js';
import { SummariesController } from './summaries.controller.js';
import { SummariesService } from './summaries.service.js';
import { SummaryInputsService } from './summaryInputs.service.js';

@Module({
  imports: [LlmModule],
  controllers: [SummariesController],
  providers: [
    // HttpClient and SummaryInputsService take optional seams for tests, so Nest can't infer their dependencies.
    { provide: HttpClient, useFactory: () => new HttpClient() },
    {
      provide: SummaryInputsService,
      useFactory: (prisma: PrismaService, http: HttpClient) =>
        new SummaryInputsService(prisma, http),
      inject: [PrismaService, HttpClient],
    },
    SummariesService,
  ],
  exports: [SummariesService],
})
export class SummariesModule {}
