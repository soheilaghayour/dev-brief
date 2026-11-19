import * as Sentry from '@sentry/nextjs';
import { describe, expect, it, vi } from 'vitest';
import { sentryOptions } from './sentryOptions';

describe('sentryOptions', () => {
  it('AC-1.7.6 error events carry the release and no cookies, auth headers or IPs', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', 'abc123');
    const captured: Sentry.ErrorEvent[] = [];
    const options = sentryOptions('https://k@o0.ingest.sentry.io/0');
    Sentry.init({
      ...options,
      // Runs the real scrub, then keeps the event instead of sending it.
      beforeSend: (event) => {
        captured.push(options.beforeSend(event));
        return null;
      },
    });
    Sentry.withScope((scope) => {
      scope.setSDKProcessingMetadata({
        normalizedRequest: {
          method: 'GET',
          url: 'https://devbrief.example/story/1',
          headers: {
            cookie: 'better-auth.session_token=S',
            authorization: 'Bearer A',
            'x-internal-token': 'T',
          },
        },
      });
      scope.setUser({ ip_address: '1.2.3.4' });
      Sentry.captureException(new Error('boom'));
    });
    await Sentry.flush(2000);
    const serialized = JSON.stringify([captured[0]?.request, captured[0]?.user]);
    expect(captured[0]?.release).toBe('abc123');
    for (const secret of ['session_token', 'Bearer A', '"T"', '1.2.3.4']) {
      expect(serialized).not.toContain(secret);
    }
  });
});
