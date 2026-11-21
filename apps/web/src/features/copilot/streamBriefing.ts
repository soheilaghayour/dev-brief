import { EventSourceParserStream } from 'eventsource-parser/stream';
import {
  A2uiServerMessageSchema,
  CopilotDoneEventSchema,
  CopilotErrorEventSchema,
  CopilotMetaEventSchema,
  type A2uiServerMessage,
  type CopilotAskRequest,
  type CopilotDoneEvent,
  type CopilotErrorEvent,
  type CopilotMetaEvent,
} from '@devbrief/shared';
import { createApiClient } from '@/lib/api/apiClient';
import { ApiResponseError } from '@/lib/api/apiError';

/** One event of the briefing stream, each payload parsed with its shared schema. */
export type StreamEvent =
  | { type: 'meta'; data: CopilotMetaEvent }
  | { type: 'a2ui'; message: A2uiServerMessage }
  | { type: 'error'; data: CopilotErrorEvent }
  | { type: 'done'; data: CopilotDoneEvent };

const EVENT_NAMES = ['meta', 'a2ui', 'error', 'done'];

// An event this client does not know, or data that is not JSON, is skipped, so the server can add an event without breaking it.
function parseEvent(name: string | undefined, data: string): StreamEvent | undefined {
  if (!name || !EVENT_NAMES.includes(name)) return undefined;
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return undefined;
  }
  switch (name) {
    case 'meta':
      return { type: 'meta', data: CopilotMetaEventSchema.parse(payload) };
    case 'a2ui': {
      // One bad message is dropped, like the renderer does; the rest of the briefing still shows.
      const message = A2uiServerMessageSchema.safeParse(payload);
      return message.success ? { type: 'a2ui', message: message.data } : undefined;
    }
    case 'error':
      return { type: 'error', data: CopilotErrorEventSchema.parse(payload) };
    default:
      return { type: 'done', data: CopilotDoneEventSchema.parse(payload) };
  }
}

/**
 * Asks the question and yields the stream's events as they arrive. Rejects with an ApiError for a JSON
 * answer before the stream (429, 5xx) and with the fetch's own error for a lost connection.
 */
export async function* streamBriefing(
  request: CopilotAskRequest,
  { signal, fetch: fetchImpl }: { signal: AbortSignal; fetch?: typeof fetch },
): AsyncGenerator<StreamEvent, void> {
  const client = createApiClient({ fetch: fetchImpl });
  const response = await client.requestStream({
    method: 'POST',
    path: '/copilot/ask',
    body: request,
    signal,
  });
  if (!response.body)
    throw new ApiResponseError('The copilot answer has no body.', response.status);

  // `fetch` + a stream reader, not EventSource: EventSource cannot POST.
  const events = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream());
  const reader = events.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      const event = parseEvent(value.event, value.data);
      if (event) yield event;
    }
  } finally {
    // Cancels the connection when the consumer stops early (close or a new question).
    await reader.cancel().catch(() => {});
  }
}
