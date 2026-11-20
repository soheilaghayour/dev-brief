import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { ENV, type Env } from '../../src/common/env/env.module.js';
import { configureApp } from '../../src/configureApp.js';
import { loadEnv } from '../../src/env.js';

/** Boots the real AppModule with the production HTTP setup, plus any test-only controllers and env overrides. */
export async function createTestApp(controllers: Type[] = [], envOverrides: Partial<Env> = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  })
    .overrideProvider(ENV)
    .useValue({ ...loadEnv(), ...envOverrides })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}
