import { ipDigest } from '../../common/rate-limit/ipDigest.js';
import { utcDay } from '../llm/budget.js';

const MS_PER_DAY = 86_400_000;

export const USER_DAILY_LIMIT = 20;
export const GUEST_DAILY_LIMIT = 5;

type Requester = { kind: 'user'; userId: string } | { kind: 'guest'; ip: string; deviceId: string };

/** The counter key, day bucket, limit and reset moment of a requester's on-demand quota for `now`'s UTC day. */
export function summaryQuota(requester: Requester, secret: string, now: Date) {
  const day = utcDay(now);
  const common = { day, resetsAt: new Date(day.getTime() + MS_PER_DAY) };
  if (requester.kind === 'user') {
    return { ...common, key: `summary:user:${requester.userId}`, limit: USER_DAILY_LIMIT };
  }
  return {
    ...common,
    key: `summary:guest:${ipDigest(requester.ip, secret, now)}:${requester.deviceId}`,
    limit: GUEST_DAILY_LIMIT,
  };
}
