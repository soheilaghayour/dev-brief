import * as shared from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { HSTS_MAX_AGE_SECONDS, PERMISSIONS_POLICY, securityHeaders } from './securityHeaders';

function headerValue(nodeEnv: string, key: string) {
  return securityHeaders(nodeEnv).find((header) => header.key === key)?.value;
}

describe('securityHeaders', () => {
  it('sets every header §8.6 names', () => {
    expect(securityHeaders('production').map((header) => header.key)).toEqual([
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]);
  });

  it('sends the same HSTS lifetime and Permissions-Policy as the api', () => {
    expect(HSTS_MAX_AGE_SECONDS).toBe(shared.HSTS_MAX_AGE_SECONDS);
    expect(PERMISSIONS_POLICY).toBe(shared.PERMISSIONS_POLICY);
  });

  it('uses a nonce-free script policy so pages stay static', () => {
    const csp = headerValue('production', 'Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline';");
    expect(csp).not.toContain('nonce');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain('ingest.sentry.io');
  });

  it('allows eval outside production only', () => {
    expect(headerValue('development', 'Content-Security-Policy')).toContain("'unsafe-eval'");
  });
});
