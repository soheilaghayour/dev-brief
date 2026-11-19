import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // env() throws when unset, but `prisma generate` (postinstall) needs no database.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
