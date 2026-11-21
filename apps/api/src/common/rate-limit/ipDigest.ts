import { createHash, createHmac } from 'node:crypto';
import { utcDay } from '../time/utcDay.js';

/** The salt of one UTC day: `HMAC-SHA256(secret, utcDay)`, so it rotates daily and needs no storage. */
function dailySalt(secret: string, now: Date) {
  return createHmac('sha256', secret).update(utcDay(now).toISOString().slice(0, 10)).digest('hex');
}

/** `sha256(ip + daily salt)`, the only form in which a client IP is stored. */
export function ipDigest(ip: string, secret: string, now: Date) {
  return createHash('sha256')
    .update(ip + dailySalt(secret, now))
    .digest('hex');
}
