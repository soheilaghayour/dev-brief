import { Module } from '@nestjs/common';
import { FeedModule } from '../feed/feed.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { BriefingPipelineService } from './briefingPipeline.service.js';
import { BriefingRetrievalService } from './briefingRetrieval.service.js';

/** The briefing pipeline; the SSE endpoint that serves it comes with the quota and cache layer. */
@Module({
  imports: [FeedModule, LlmModule],
  providers: [BriefingRetrievalService, BriefingPipelineService],
  exports: [BriefingPipelineService],
})
export class CopilotModule {}
