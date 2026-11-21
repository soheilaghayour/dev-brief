import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('API image start command', () => {
  it('migrates, then seeds, then starts the server, each step stopping the start when it fails', () => {
    const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
    const cmd = /^CMD \["sh", "-c", "(.+)"\]$/m.exec(dockerfile)?.[1];

    expect(cmd?.split(' && ')).toEqual([
      'node_modules/.bin/prisma migrate deploy',
      'node dist/cli/seed.js',
      'exec node dist/main.js',
    ]);
  });
});
