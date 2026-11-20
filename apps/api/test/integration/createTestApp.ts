import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { ENV } from '../../src/common/env/env.module.js';
import { configureApp } from '../../src/configureApp.js';
import { loadEnv } from '../../src/env.js';

/** Boots the real AppModule with the production HTTP setup, plus any test-only controllers and raw env overrides, validated like the real env. */
export async function createTestApp(
  controllers: Type[] = [],
  envOverrides: Record<string, string> = {},
) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  })
    .overrideProvider(ENV)
    .useValue(loadEnv({ ...process.env, ...envOverrides }))
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}
