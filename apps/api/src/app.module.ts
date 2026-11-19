import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({ imports: [CommonModule, PrismaModule, HealthModule] })
export class AppModule {}
