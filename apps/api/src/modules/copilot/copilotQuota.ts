import { ipDigest } from '../../common/rate-limit/ipDigest.js';
import { utcDay } from '../llm/budget.js';

const MS_PER_DAY = 86_400_000;

export const USER_DAILY_LIMIT = 20;
export const GUEST_DAILY_LIMIT = 3;
export const GUEST_IP_DAILY_LIMIT = 10;

type Requester = { kind: 'user'; userId: string } | { kind: 'guest'; ip: string; deviceId: string };

/** The daily counters a question needs a slot in, the first being the one the UI shows, and the next UTC midnight they reset at. */
export function copilotQuota(requester: Requester, secret: string, now: Date) {
  const day = utcDay(now);
  const common = { day, resetsAt: new Date(day.getTime() + MS_PER_DAY) };
  if (requester.kind === 'user') {
    return {
      ...common,
      counters: [{ key: `copilot:user:${requester.userId}`, limit: USER_DAILY_LIMIT }],
    };
  }
  const digest = ipDigest(requester.ip, secret, now);
  return {
    ...common,
    // A guest needs room in both: the device quota, and the IP backstop against rotating device ids.
    counters: [
      { key: `copilot:guest:${digest}:${requester.deviceId}`, limit: GUEST_DAILY_LIMIT },
      { key: `copilot:ip:${digest}`, limit: GUEST_IP_DAILY_LIMIT },
    ],
  };
}

export type CopilotQuotaPlan = ReturnType<typeof copilotQuota>;

/** What the UI shows: the primary limit, and the room left in the tightest counter. */
export function remainingQuota(quota: CopilotQuotaPlan, counts: readonly number[]) {
  const [primary] = quota.counters;
  const remaining = Math.min(
    ...quota.counters.map(({ limit }, index) => limit - (counts[index] ?? 0)),
  );
  return {
    limit: primary?.limit ?? 0,
    remaining: Math.max(0, remaining),
    resetsAt: quota.resetsAt.toISOString(),
  };
}
