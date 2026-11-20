import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { LanguageModel } from 'ai';
import { AppModule } from '../../src/app.module.js';
import { DevtoClient } from '../../src/common/devto/devtoClient.js';
import { ENV } from '../../src/common/env/env.module.js';
import { HttpClient } from '../../src/common/http/httpClient.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { configureApp } from '../../src/configureApp.js';
import { loadEnv } from '../../src/env.js';
import { LANGUAGE_MODEL } from '../../src/modules/llm/llm.service.js';
import { SummaryInputsService } from '../../src/modules/summaries/summaryInputs.service.js';
import { mockLanguageModel } from '../mockLanguageModel.js';

// CI never calls the live LLM, so a test app that scripts no reply fails any model call.
const UNSCRIPTED_MODEL = mockLanguageModel(async () => {
  throw new Error(
    'This test app has no scripted model reply: pass a languageModel to createTestApp.',
  );
});

// No test reaches a live source, so a test app that scripts no upstream fails any summary fetch.
const UNSCRIPTED_UPSTREAM: typeof fetch = async () => {
  throw new Error(
    'This test app has no scripted upstream: pass an upstreamFetch to createTestApp.',
  );
};

/** A SummaryInputsService override whose HN Algolia and Dev.to requests go to `upstreamFetch`, with instant retries and no Dev.to gap. */
export function summaryInputsOverride(upstreamFetch: typeof fetch) {
  return {
    factory: (prisma: PrismaService) => {
      // random = 0 makes retry backoff instant.
      const http = new HttpClient(upstreamFetch, () => 0);
      return new SummaryInputsService(prisma, http, new DevtoClient(http, async () => undefined));
    },
    inject: [PrismaService],
  };
}

/** Boots the real AppModule with the production HTTP setup, plus any test-only controllers, raw env overrides validated like the real env, a mock model and a scripted summary upstream. */
export async function createTestApp(
  controllers: Type[] = [],
  envOverrides: Record<string, string> = {},
  {
    languageModel = UNSCRIPTED_MODEL,
    upstreamFetch = UNSCRIPTED_UPSTREAM,
  }: { languageModel?: LanguageModel; upstreamFetch?: typeof fetch } = {},
) {
  // The cron jobs stay off unless a test opts in: an app alive at :05 UTC would ingest from live sources.
  const env = loadEnv({ ...process.env, INGEST_SCHEDULE: 'false', ...envOverrides });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env)],
    controllers,
  })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(LANGUAGE_MODEL)
    .useValue(languageModel)
    .overrideProvider(SummaryInputsService)
    .useFactory(summaryInputsOverride(upstreamFetch))
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}
