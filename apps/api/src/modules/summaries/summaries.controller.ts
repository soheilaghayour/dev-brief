import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { StoryIdSchema, StorySummarySchema, SummaryRequestSchema } from '@devbrief/shared';
import type { SummaryRequest } from '@devbrief/shared';
import type { Request, Response } from 'express';
import { PrivateNoStore, PublicCache } from '../../common/cache/cacheControl.js';
import { RequiresFeature } from '../../common/features/requiresFeature.decorator.js';
import { IpRateLimit, IpRateLimitGuard } from '../../common/rate-limit/ipRateLimit.guard.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { ZodPipe } from '../../common/zod/zod.pipe.js';
import { OptionalAuthGuard, type CurrentUserData } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/currentUser.decorator.js';
import { OnDemandSummaryService } from './onDemandSummary.service.js';
import { SummariesService } from './summaries.service.js';

/** The short-window limit of PRD §8.6 for the on-demand summary route. */
const SUMMARY_IP_LIMIT = { bucket: 'summary', perMinute: 5 };

@Controller('stories')
@RequiresFeature('summaries')
export class SummariesController {
  constructor(
    private readonly summaries: SummariesService,
    private readonly onDemand: OnDemandSummaryService,
  ) {}

  @Get(':id/summary')
  @PublicCache()
  @Contract({ response: StorySummarySchema })
  get(@Param('id', new ZodPipe(StoryIdSchema)) id: string) {
    return this.summaries.get(id);
  }

  @Post(':id/summary')
  @UseGuards(IpRateLimitGuard, OptionalAuthGuard)
  @IpRateLimit(SUMMARY_IP_LIMIT)
  @PrivateNoStore()
  @Contract({ body: SummaryRequestSchema, response: StorySummarySchema })
  async summarize(
    @Param('id', new ZodPipe(StoryIdSchema)) id: string,
    @Body(new ZodPipe(SummaryRequestSchema.default({}))) body: SummaryRequest,
    @CurrentUser() user: CurrentUserData | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { kind, summary } = await this.onDemand.summarize(id, {
      userId: user?.id,
      deviceId: body.deviceId,
      ip: request.ip ?? '',
    });
    response.status(kind === 'created' ? 201 : 200);
    return summary;
  }
}
