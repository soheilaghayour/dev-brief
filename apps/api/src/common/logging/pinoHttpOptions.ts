import type { Options } from 'pino-http';
import type { Env } from '../env/env.module.js';

// Sessions can be hijacked from logged cookies, and §8.6 stores client IPs only hashed.
const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-internal-token"]',
  'req.headers["x-forwarded-for"]',
  'req.remoteAddress',
  'res.headers["set-cookie"]',
];

/** The request logger's options; `assignRequestId` has already set the request id. */
export function pinoHttpOptions(env: Pick<Env, 'NODE_ENV'>) {
  return {
    level: env.NODE_ENV === 'test' ? 'silent' : 'info',
    genReqId: (request) => request.id,
    redact: REDACTED_PATHS,
  } satisfies Options;
}
