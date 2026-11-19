import { Controller, Delete, Get, HttpCode, Req, Res, UseGuards } from '@nestjs/common';
import { MeSchema } from '@devbrief/shared';
import type { Request, Response } from 'express';
import { PrivateNoStore } from '../../common/cache/cacheControl.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { AuthGuard, type CurrentUserData } from './auth.guard.js';
import { CurrentUser } from './currentUser.decorator.js';
import { MeService } from './me.service.js';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  @PrivateNoStore()
  @Contract({ response: MeSchema })
  getMe(@CurrentUser() user: CurrentUserData) {
    return this.meService.getMe(user.id);
  }

  @Delete()
  @PrivateNoStore()
  @HttpCode(204)
  async deleteMe(
    @CurrentUser() user: CurrentUserData,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieHeaders = await this.meService.deleteMe(user.id, request.headers);
    for (const cookie of cookieHeaders.getSetCookie()) response.append('Set-Cookie', cookie);
  }
}
