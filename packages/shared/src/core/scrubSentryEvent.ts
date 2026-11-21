const SECRET_HEADERS = new Set([
  'cookie',
  'set-cookie',
  'authorization',
  'x-internal-token',
  'x-forwarded-for',
  'x-real-ip',
  'forwarded',
]);

interface Scrubbable {
  request?:
    | {
        headers?: Record<string, unknown>;
        cookies?: unknown;
        data?: unknown;
        query_string?: unknown;
      }
    | undefined;
  user?: { ip_address?: unknown } | undefined;
  data?: { headers?: Record<string, unknown>; cookies?: unknown } | undefined;
}

function withoutSecretHeaders(headers: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !SECRET_HEADERS.has(name.toLowerCase())),
  );
}

function scrubRequestParts(parts: { headers?: Record<string, unknown>; cookies?: unknown }) {
  delete parts.cookies;
  if (parts.headers) parts.headers = withoutSecretHeaders(parts.headers);
}

/** Removes session cookies, auth headers, the internal token, client IPs and request contents (body, query string) from a Sentry event (§8.6). */
export function scrubSentryEvent<T extends Scrubbable>(event: T): T {
  if (event.request) {
    scrubRequestParts(event.request);
    // Bodies and queries carry what users typed (copilot questions, search terms, notes).
    delete event.request.data;
    delete event.request.query_string;
  }
  if (event.user) delete event.user.ip_address;
  return event;
}

/** The same scrub for a breadcrumb, whose request details sit under `data`. */
export function scrubSentryBreadcrumb<T extends Scrubbable>(breadcrumb: T): T {
  if (breadcrumb.data) scrubRequestParts(breadcrumb.data);
  return breadcrumb;
}
