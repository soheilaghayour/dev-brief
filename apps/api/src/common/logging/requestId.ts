import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Only short, plain ids are echoed: a client-supplied id lands in logs and headers.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

function resolveRequestId(request: IncomingMessage, response: ServerResponse) {
  const supplied = request.headers['x-request-id'];
  const requestId =
    typeof supplied === 'string' && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
  response.setHeader('x-request-id', requestId);
  return requestId;
}

/** Express middleware: accepts the caller's `x-request-id` or generates one, before the body parser so parser errors carry it too. */
export function assignRequestId(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  request.id = resolveRequestId(request, response);
  next();
}
