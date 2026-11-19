import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { loadEnv } from '../../src/env.js';

/** Gives a test file a Prisma client on an emptied database and disconnects it afterwards. */
export function useTestDatabase() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }),
  });

  beforeAll(() => truncateAllTables(prisma));
  afterAll(() => prisma.$disconnect());

  return prisma;
}

async function truncateAllTables(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const names = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}
