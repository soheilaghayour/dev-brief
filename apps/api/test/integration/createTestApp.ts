import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { LanguageModel } from 'ai';
import { AppModule } from '../../src/app.module.js';
import { ENV } from '../../src/common/env/env.module.js';
import { configureApp } from '../../src/configureApp.js';
import { loadEnv } from '../../src/env.js';
import { LANGUAGE_MODEL } from '../../src/modules/llm/llm.service.js';
import { mockLanguageModel } from '../mockLanguageModel.js';

// CI never calls the live LLM, so a test app that scripts no reply fails any model call.
const UNSCRIPTED_MODEL = mockLanguageModel(async () => {
  throw new Error(
    'This test app has no scripted model reply: pass a languageModel to createTestApp.',
  );
});

/** Boots the real AppModule with the production HTTP setup, plus any test-only controllers, raw env overrides validated like the real env, and a mock model. */
export async function createTestApp(
  controllers: Type[] = [],
  envOverrides: Record<string, string> = {},
  languageModel: LanguageModel = UNSCRIPTED_MODEL,
) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  })
    .overrideProvider(ENV)
    .useValue(loadEnv({ ...process.env, ...envOverrides }))
    .overrideProvider(LANGUAGE_MODEL)
    .useValue(languageModel)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}
