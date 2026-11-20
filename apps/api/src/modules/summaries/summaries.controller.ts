import { Controller, Get, Param } from '@nestjs/common';
import { StoryIdSchema, StorySummarySchema } from '@devbrief/shared';
import { PublicCache } from '../../common/cache/cacheControl.js';
import { RequiresFeature } from '../../common/features/requiresFeature.decorator.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { ZodPipe } from '../../common/zod/zod.pipe.js';
import { SummariesService } from './summaries.service.js';

@Controller('stories')
@RequiresFeature('summaries')
export class SummariesController {
  constructor(private readonly summaries: SummariesService) {}

  @Get(':id/summary')
  @PublicCache()
  @Contract({ response: StorySummarySchema })
  get(@Param('id', new ZodPipe(StoryIdSchema)) id: string) {
    return this.summaries.get(id);
  }
}
