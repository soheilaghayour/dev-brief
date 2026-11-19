import { Inject, Injectable } from '@nestjs/common';
import type { Me } from '@devbrief/shared';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AUTH } from './auth.constants.js';
import { SIGN_IN_PROVIDERS, type Auth } from './auth.js';

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  async getMe(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { accounts: { select: { providerId: true } } },
    });
    if (!user) throw new ApiException('UNAUTHENTICATED', 'Sign in to continue.');
    const linked = new Set(user.accounts.map(({ providerId }) => providerId));
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      providers: SIGN_IN_PROVIDERS.filter((provider) => linked.has(provider)),
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** Deletes the user (sessions, accounts and saves cascade) and returns the headers that expire the session cookie. */
  async deleteMe(userId: string, requestHeaders: IncomingHttpHeaders) {
    // Deleting first, so a failed delete leaves the user signed in; signOut tolerates the session the cascade removed.
    await this.prisma.user.delete({ where: { id: userId } });
    const { headers } = await this.auth.api.signOut({
      headers: fromNodeHeaders(requestHeaders),
      returnHeaders: true,
    });
    return headers;
  }
}
