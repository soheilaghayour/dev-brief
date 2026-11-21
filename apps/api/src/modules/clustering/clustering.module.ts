import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { ClusterMembershipService } from './clusterMembership.service.js';
import { ClusterPoolService } from './clusterPool.service.js';
import { ClusteringStep } from './clustering.step.js';

@Module({
  imports: [IngestionModule, LlmModule],
  providers: [ClusterPoolService, ClusterMembershipService, ClusteringStep],
})
export class ClusteringModule {}
