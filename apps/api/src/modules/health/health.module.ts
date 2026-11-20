import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({ imports: [LlmModule], controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
