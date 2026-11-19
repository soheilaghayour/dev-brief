import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { loadEnv } from '../src/env.js';

const sourcesJson: unknown = JSON.parse(
  readFileSync(new URL('./seed/sources.json', import.meta.url), 'utf8'),
);

const SeedSourcesSchema = z.array(
  z.object({
    slug: z.string().min(1),
    kind: z.enum(['hn', 'devto', 'rss']),
    name: z.string().min(1),
    siteUrl: z.string().url(),
    feedUrl: z.string().url().optional(),
  }),
);

/** Upserts every seeded source by slug, so running it again adds no rows. */
export async function seedSources(prisma: PrismaClient) {
  for (const { slug, ...fields } of SeedSourcesSchema.parse(sourcesJson)) {
    await prisma.source.upsert({ where: { slug }, create: { slug, ...fields }, update: fields });
  }
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }),
  });
  try {
    await seedSources(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Vitest imports seedSources; only a direct run (prisma db seed) seeds the database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
