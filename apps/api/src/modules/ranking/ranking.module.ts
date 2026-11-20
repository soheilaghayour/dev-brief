import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { FeedCacheClearStep } from './feedCacheClear.step.js';
import { RankingService } from './ranking.service.js';

@Module({ imports: [IngestionModule], providers: [RankingService, FeedCacheClearStep] })
export class RankingModule {}
