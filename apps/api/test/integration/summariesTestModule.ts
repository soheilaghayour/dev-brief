import { Test } from '@nestjs/testing';
import type { MockLanguageModelV4 } from 'ai/test';
import { ENV, EnvModule } from '../../src/common/env/env.module.js';
import { PrismaModule } from '../../src/common/prisma/prisma.module.js';
import { loadEnv } from '../../src/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { IngestionModule } from '../../src/modules/ingestion/ingestion.module.js';
import { SOURCE_ADAPTERS } from '../../src/modules/ingestion/sourceAdapter.js';
import { LANGUAGE_MODEL } from '../../src/modules/llm/llm.service.js';
import { SummariesModule } from '../../src/modules/summaries/summaries.module.js';
import { SummaryInputsService } from '../../src/modules/summaries/summaryInputs.service.js';
import { mockLanguageModel } from '../mockLanguageModel.js';
import { summaryFixtureFetch } from '../summaryFixtures.js';
import { summaryInputsOverride } from './createTestApp.js';

/** Summaries on, with a key the mock model never sends. */
export const SUMMARIES_ON = { FEATURE_SUMMARIES: 'true', ANTHROPIC_API_KEY: 'test-key' };

type GenerateOptions = Parameters<MockLanguageModelV4['doGenerate']>[0];

/** The prompt a mock model call received, as one string. */
export function promptOf(options: GenerateOptions) {
  return JSON.stringify(options.prompt);
}

/** The summaries and ingestion modules with a scripted model, the recorded upstream payloads, no source adapters and no ranking step. */
export async function createSummariesModule({
  doGenerate,
  env = SUMMARIES_ON,
  fixtures = {},
}: {
  doGenerate: Parameters<typeof mockLanguageModel>[0];
  env?: Record<string, string>;
  fixtures?: Parameters<typeof summaryFixtureFetch>[0];
}) {
  const model = mockLanguageModel(doGenerate);
  const upstream = summaryFixtureFetch(fixtures);
  const moduleRef = await Test.createTestingModule({
    imports: [EnvModule, PrismaModule, IngestionModule, SummariesModule],
  })
    .overrideProvider(ENV)
    .useValue(loadEnv({ ...process.env, ...env }))
    // No adapters: a run skips every source, so it never reaches the network and goes straight to the post-run steps.
    .overrideProvider(SOURCE_ADAPTERS)
    .useValue([])
    .overrideProvider(LANGUAGE_MODEL)
    .useValue(model)
    .overrideProvider(SummaryInputsService)
    .useFactory(summaryInputsOverride(upstream.fetch))
    .compile();
  await moduleRef.init();
  return { moduleRef, model, upstreamRequests: upstream.requests };
}

/** Inserts a story with one HN item whose comment count is `commentsCount`; its Algolia id picks the recorded thread. */
export async function createDiscussedStory(
  prisma: PrismaClient,
  {
    title,
    sourceId,
    commentsCount = 46,
    rankScore = 1,
    publishedAt = new Date(),
    externalId = '50544168',
    excerpt,
  }: {
    title: string;
    sourceId: string;
    commentsCount?: number;
    rankScore?: number;
    publishedAt?: Date;
    externalId?: string;
    excerpt?: string;
  },
) {
  const url = `https://example.com/${encodeURIComponent(title)}`;
  return prisma.story.create({
    data: {
      canonicalUrl: url,
      url,
      domain: 'example.com',
      title,
      normalizedTitle: title.toLowerCase(),
      excerpt,
      publishedAt,
      rankScore,
      tags: [],
      taggerVersion: 1,
      items: {
        create: {
          sourceId,
          externalId,
          url,
          canonicalUrl: url,
          title,
          publishedAt,
          commentsCount,
        },
      },
    },
  });
}
