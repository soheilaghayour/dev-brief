import { describe, expect, it } from 'vitest';
import { scrubSentryBreadcrumb, scrubSentryEvent } from './scrubSentryEvent.js';

describe('scrubSentryEvent', () => {
  it('AC-1.7.6 drops cookies, auth headers, the internal token and client IPs', () => {
    const event = scrubSentryEvent({
      request: {
        cookies: { session: 's' },
        headers: {
          Cookie: 'session=s',
          authorization: 'Bearer a',
          'X-Internal-Token': 't',
          'set-cookie': 'x=y',
          'x-forwarded-for': '1.2.3.4',
          'user-agent': 'ua',
        },
      },
      user: { ip_address: '1.2.3.4', id: 'u' },
    });
    expect(event).toEqual({ request: { headers: { 'user-agent': 'ua' } }, user: { id: 'u' } });
  });

  it('keeps an event with no request or user as it is', () => {
    expect(scrubSentryEvent({})).toEqual({});
  });
});

describe('scrubSentryBreadcrumb', () => {
  it('AC-1.7.6 drops secret headers and cookies from breadcrumb data', () => {
    const breadcrumb = scrubSentryBreadcrumb({
      data: { url: '/x', cookies: 'a=b', headers: { authorization: 'x', accept: 'json' } },
    });
    expect(breadcrumb).toEqual({ data: { url: '/x', headers: { accept: 'json' } } });
  });
});
