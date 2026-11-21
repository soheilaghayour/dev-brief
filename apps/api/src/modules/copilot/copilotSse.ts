import {
  A2uiServerMessageSchema,
  CopilotDoneEventSchema,
  CopilotErrorEventSchema,
  CopilotMetaEventSchema,
  type A2uiServerMessage,
  type CopilotDoneEvent,
  type CopilotErrorEvent,
  type CopilotMetaEvent,
} from '@devbrief/shared';
import type { z } from 'zod';

/** One event of the stream, in the shapes PRD §6.4.2 gives. */
export type CopilotSseEvent =
  | { event: 'meta'; data: CopilotMetaEvent }
  | { event: 'a2ui'; data: A2uiServerMessage }
  | { event: 'error'; data: CopilotErrorEvent }
  | { event: 'done'; data: CopilotDoneEvent };

const EVENT_SCHEMAS = {
  meta: CopilotMetaEventSchema,
  a2ui: A2uiServerMessageSchema,
  error: CopilotErrorEventSchema,
  done: CopilotDoneEventSchema,
} satisfies Record<CopilotSseEvent['event'], z.ZodTypeAny>;

/** The error event of an unexpected failure, which carries no detail the reader could act on. */
export const INTERNAL_ERROR = {
  event: 'error',
  data: { code: 'INTERNAL', message: 'Something went wrong.' },
} as const satisfies CopilotSseEvent;

/** The comment line that keeps proxies from closing an idle connection. */
export const HEARTBEAT = ': ping\n\n';

/** The wire form of an event; its payload is parsed with its shared schema first, in every environment. */
export function formatSseEvent({ event, data }: CopilotSseEvent) {
  return `event: ${event}\ndata: ${JSON.stringify(EVENT_SCHEMAS[event].parse(data))}\n\n`;
}
