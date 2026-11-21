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

function parseEvent(name: string | undefined, data: string): StreamEvent | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new ApiResponseError(`The ${name} event is not valid JSON.`, 200);
  }
  switch (name) {
    case 'meta':
      return { type: 'meta', data: CopilotMetaEventSchema.parse(payload) };
    case 'a2ui':
      return { type: 'a2ui', message: A2uiServerMessageSchema.parse(payload) };
    case 'error':
      return { type: 'error', data: CopilotErrorEventSchema.parse(payload) };
    case 'done':
      return { type: 'done', data: CopilotDoneEventSchema.parse(payload) };
    // An event this client does not know is skipped, so the server can add one without breaking it.
    default:
      return undefined;
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
