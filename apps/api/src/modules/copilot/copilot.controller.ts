import { Body, Controller, Get, Logger, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import {
  CopilotAskRequestSchema,
  CopilotQuotaQuerySchema,
  CopilotQuotaSchema,
  type CopilotAskRequest,
  type CopilotQuotaQuery,
} from '@devbrief/shared';
import type { Request, Response } from 'express';
import { PrivateNoStore } from '../../common/cache/cacheControl.js';
import { RequiresFeature } from '../../common/features/requiresFeature.decorator.js';
import { IpRateLimit, IpRateLimitGuard } from '../../common/rate-limit/ipRateLimit.guard.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { ZodPipe } from '../../common/zod/zod.pipe.js';
import { OptionalAuthGuard, type CurrentUserData } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/currentUser.decorator.js';
import { CopilotService } from './copilot.service.js';
import { formatSseEvent, HEARTBEAT } from './copilotSse.js';

/** The short-window limit of PRD §8.6 for the ask route. */
const ASK_IP_LIMIT = { bucket: 'copilot', perMinute: 5 };

/** PRD §6.4.2: the interval of the `: ping` comment. */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/** PRD §6.4.2 headers; no proxy may buffer or transform the stream. */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

const logger = new Logger('CopilotController');

@Controller('copilot')
@RequiresFeature('copilot')
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  // Nest's @Sse only does GET, so the stream is written on the raw response.
  @Post('ask')
  @UseGuards(IpRateLimitGuard, OptionalAuthGuard)
  @IpRateLimit(ASK_IP_LIMIT)
  @Contract({ body: CopilotAskRequestSchema })
  async ask(
    @Body(new ZodPipe(CopilotAskRequestSchema)) body: CopilotAskRequest,
    @CurrentUser() user: CurrentUserData | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const disconnect = new AbortController();
    // The response's `close`, not the request's: a request emits `close` once its body is read.
    response.on('close', () => {
      if (!response.writableEnded) disconnect.abort();
    });
    // Errors before the stream starts (quota, validation) are thrown here, so they are still JSON.
    const events = await this.copilot.ask(
      body,
      { userId: user?.id, ip: request.ip ?? '' },
      disconnect.signal,
    );

    response.status(200).set(SSE_HEADERS).flushHeaders();
    response.write(HEARTBEAT);
    const heartbeat = setInterval(() => response.write(HEARTBEAT), HEARTBEAT_INTERVAL_MS);
    try {
      for await (const event of events) {
        if (disconnect.signal.aborted) break;
        response.write(formatSseEvent(event));
      }
    } catch (error) {
      logger.error(error);
      if (!disconnect.signal.aborted) {
        response.write(
          formatSseEvent({
            event: 'error',
            data: { code: 'INTERNAL', message: 'Something went wrong.' },
          }),
        );
      }
    } finally {
      clearInterval(heartbeat);
      response.end();
    }
  }

  @Get('quota')
  @UseGuards(OptionalAuthGuard)
  @PrivateNoStore()
  @Contract({ query: CopilotQuotaQuerySchema, response: CopilotQuotaSchema })
  quota(
    @Query(new ZodPipe(CopilotQuotaQuerySchema)) query: CopilotQuotaQuery,
    @CurrentUser() user: CurrentUserData | undefined,
    @Req() request: Request,
  ) {
    return this.copilot.quota({ userId: user?.id, ip: request.ip ?? '' }, query.deviceId);
  }
}
