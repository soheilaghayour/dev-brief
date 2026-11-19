import { createServer } from 'node:http';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { pinoHttpOptions } from './pinoHttpOptions.js';
import { assignRequestId } from './requestId.js';

async function logLineFor(headers: Record<string, string>) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const logger = pinoHttp({ ...pinoHttpOptions({ NODE_ENV: 'production' }), stream });
  const server = createServer((req, res) => {
    assignRequestId(req, res, () => logger(req, res, () => res.end('ok')));
  });
  await request(server).get('/').set(headers);
  return lines.join('');
}

describe('request logging', () => {
  it('redacts cookies, authorization, the internal token and client IPs', async () => {
    const log = await logLineFor({
      Cookie: 'better-auth.session_token=SECRET123',
      Authorization: 'Bearer TOKEN456',
      'x-internal-token': 'INTERNAL789',
      'X-Forwarded-For': '203.0.113.7',
    });
    expect(log).toContain('"url":"/"');
    expect(log).not.toMatch(/SECRET123|TOKEN456|INTERNAL789|203\.0\.113\.7/);
    expect(log).toContain('"remoteAddress":"[Redacted]"');
  });
});
