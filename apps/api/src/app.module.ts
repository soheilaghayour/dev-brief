import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({ imports: [PrismaModule, HealthModule] })
export class AppModule {}
