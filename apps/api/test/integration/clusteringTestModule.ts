import { Test } from '@nestjs/testing';
import { normalizeTitle } from '@devbrief/shared';
import { ENV, EnvModule } from '../../src/common/env/env.module.js';
import { PrismaModule } from '../../src/common/prisma/prisma.module.js';
import { loadEnv } from '../../src/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { ClusteringModule } from '../../src/modules/clustering/clustering.module.js';
import { ClusteringStep } from '../../src/modules/clustering/clustering.step.js';
import { IngestionModule } from '../../src/modules/ingestion/ingestion.module.js';
import { SOURCE_ADAPTERS } from '../../src/modules/ingestion/sourceAdapter.js';
import { LANGUAGE_MODEL } from '../../src/modules/llm/llm.service.js';
import { mockLanguageModel } from '../mockLanguageModel.js';

/** Clusters and automatic clustering on, with a key the mock model never sends. */
export const CLUSTERING_ON = {
  FEATURE_CLUSTERS: 'true',
  AUTO_CLUSTERING: 'true',
  ANTHROPIC_API_KEY: 'test-key',
};

/** The clustering and ingestion modules with a scripted model and no source adapters. */
export async function createClusteringModule({
  doGenerate,
  env = CLUSTERING_ON,
}: {
  doGenerate: Parameters<typeof mockLanguageModel>[0];
  env?: Record<string, string>;
}) {
  const model = mockLanguageModel(doGenerate);
  const moduleRef = await Test.createTestingModule({
    imports: [EnvModule, PrismaModule, IngestionModule, ClusteringModule],
  })
    .overrideProvider(ENV)
    .useValue(loadEnv({ ...process.env, ...env }))
    // No adapters: a run skips every source and goes straight to the post-run steps.
    .overrideProvider(SOURCE_ADAPTERS)
    .useValue([])
    .overrideProvider(LANGUAGE_MODEL)
    .useValue(model)
    .compile();
  await moduleRef.init();
  return { moduleRef, model, step: moduleRef.get(ClusteringStep) };
}

const MINUTE_MS = 60_000;

/** A run that began a minute ago: stories seeded `fresh` are its new ones, the others are older. */
export function runContext(signal = new AbortController().signal) {
  return {
    runId: 'test-run',
    startedAt: new Date(Date.now() - MINUTE_MS),
    now: new Date(),
    signal,
  };
}

export type SeededStory = {
  title: string;
  url?: string;
  sourceId: string;
  publishedAt?: Date;
  excerpt?: string;
  rankScore?: number;
  /** True for a story the test run created; false for one an earlier run left. */
  fresh?: boolean;
  id?: string;
};

/** Inserts a story with one item on `sourceId`; a story is `fresh` unless the test says otherwise. */
export function seedStory(prisma: PrismaClient, story: SeededStory) {
  const slug = story.title.toLowerCase().replaceAll(/\W+/g, '-');
  const url = story.url ?? `https://example.com/${slug}`;
  const publishedAt = story.publishedAt ?? new Date();
  return prisma.story.create({
    data: {
      id: story.id,
      canonicalUrl: url,
      url,
      domain: new URL(url).hostname,
      title: story.title,
      normalizedTitle: normalizeTitle(story.title),
      excerpt: story.excerpt,
      publishedAt,
      firstSeenAt: story.fresh === false ? new Date(Date.now() - 2 * 60 * MINUTE_MS) : new Date(),
      rankScore: story.rankScore ?? 0,
      tags: [],
      taggerVersion: 1,
      items: {
        create: {
          sourceId: story.sourceId,
          externalId: `${slug}-${story.sourceId}`,
          url,
          canonicalUrl: url,
          title: story.title,
          publishedAt,
        },
      },
    },
  });
}
