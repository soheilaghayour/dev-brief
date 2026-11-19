import { Global, Module } from '@nestjs/common';
import { loadEnv } from '../../env.js';

export const ENV = Symbol('ENV');
export type Env = ReturnType<typeof loadEnv>;

/** Makes the validated env injectable, so nothing else reads `process.env`. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class EnvModule {}
