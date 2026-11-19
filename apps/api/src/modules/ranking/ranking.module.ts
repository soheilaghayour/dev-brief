import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { RankingService } from './ranking.service.js';

@Module({ imports: [IngestionModule], providers: [RankingService] })
export class RankingModule {}
