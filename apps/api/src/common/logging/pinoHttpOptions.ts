import type { Options } from 'pino-http';
import type { Env } from '../env/env.module.js';

// Every header a proxy may use to pass on the client IP. Traefik (Coolify's proxy) sets x-real-ip.
export const CLIENT_IP_HEADERS = [
  'x-real-ip',
  'x-forwarded-for',
  'forwarded',
  'cf-connecting-ip',
  'true-client-ip',
  'x-client-ip',
];

// Sessions can be hijacked from logged cookies, and §8.6 stores client IPs only hashed.
const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-internal-token"]',
  ...CLIENT_IP_HEADERS.map((name) => `req.headers["${name}"]`),
  'req.remoteAddress',
  'req.remotePort',
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
