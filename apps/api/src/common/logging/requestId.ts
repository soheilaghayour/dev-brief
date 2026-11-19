import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Only short, plain ids are echoed: a client-supplied id lands in logs and headers.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Accepts the caller's `x-request-id` or generates one, and echoes it on the response. */
export function resolveRequestId(request: IncomingMessage, response: ServerResponse) {
  const supplied = request.headers['x-request-id'];
  const requestId =
    typeof supplied === 'string' && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
  response.setHeader('x-request-id', requestId);
  return requestId;
}
