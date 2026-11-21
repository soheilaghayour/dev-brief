import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { SourceKindSchema } from '@devbrief/shared';
import { z } from 'zod';
import { loadEnv } from '../env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// The path resolves from src/cli and from dist/cli alike, so the production image can seed without tsx.
const sourcesJson: unknown = JSON.parse(
  readFileSync(new URL('../../prisma/seed/sources.json', import.meta.url), 'utf8'),
);

const SeedSourcesSchema = z.array(
  z.object({
    slug: z.string().min(1),
    kind: SourceKindSchema,
    name: z.string().min(1),
    siteUrl: z.string().url(),
    feedUrl: z.string().url().optional(),
    enabled: z.boolean().default(true),
  }),
);

/** The seeded sources, validated, with `enabled` defaulted to true. */
export const SEED_SOURCES = SeedSourcesSchema.parse(sourcesJson);

/** Upserts every seeded source by slug, writing `enabled` on update too, so a deploy switches a source on or off. */
export async function seedSources(prisma: PrismaClient) {
  for (const { slug, ...fields } of SEED_SOURCES) {
    await prisma.source.upsert({ where: { slug }, create: { slug, ...fields }, update: fields });
  }
}

/** Seeds the database that DATABASE_URL names. */
export async function runSeed() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }),
  });
  try {
    await seedSources(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
