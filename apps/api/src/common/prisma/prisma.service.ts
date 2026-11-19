import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { loadEnv } from '../../env.js';

/** The Prisma client, connected through the pg driver adapter. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
