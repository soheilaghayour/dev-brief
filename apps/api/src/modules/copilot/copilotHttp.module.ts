import { Module } from '@nestjs/common';
import { CopilotController } from './copilot.controller.js';
import { CopilotModule } from './copilot.module.js';
import { CopilotService } from './copilot.service.js';
import { CopilotQuotaService } from './copilotQuota.service.js';

/** The copilot routes; only AppModule imports it, so a CLI that imports CopilotModule doesn't build Better Auth. */
@Module({
  imports: [CopilotModule],
  controllers: [CopilotController],
  providers: [CopilotService, CopilotQuotaService],
})
export class CopilotHttpModule {}
