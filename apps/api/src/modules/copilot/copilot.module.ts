import { Module } from '@nestjs/common';
import { FeedModule } from '../feed/feed.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { BriefingPipelineService } from './briefingPipeline.service.js';
import { BriefingRetrievalService } from './briefingRetrieval.service.js';

/** The briefing pipeline; `CopilotHttpModule` serves it. */
@Module({
  imports: [FeedModule, LlmModule],
  providers: [BriefingRetrievalService, BriefingPipelineService],
  exports: [BriefingPipelineService],
})
export class CopilotModule {}
