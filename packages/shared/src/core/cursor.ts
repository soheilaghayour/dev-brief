import { z } from 'zod';

const CursorPayloadSchema = z.object({
  v: z.literal(1),
  sort: z.string(),
  k: z.tuple([z.union([z.string(), z.number()]), z.string()]),
});
export type CursorPayload = z.infer<typeof CursorPayloadSchema>;

/** Thrown for a malformed cursor or one issued for another sort; the API maps it to 400 INVALID_CURSOR. */
export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid cursor');
    this.name = 'InvalidCursorError';
  }
}

/** Encodes a keyset position as an opaque base64url string. */
export function encodeCursor(sort: string, sortKey: string | number, id: string): string {
  const payload: CursorPayload = { v: 1, sort, k: [sortKey, id] };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** Decodes a cursor and checks it was issued for `expectedSort`. */
export function decodeCursor(cursor: string, expectedSort: string): CursorPayload {
  let json: unknown;
  try {
    const base64 = cursor.replaceAll('-', '+').replaceAll('_', '/');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new InvalidCursorError();
  }
  const parsed = CursorPayloadSchema.safeParse(json);
  if (!parsed.success || parsed.data.sort !== expectedSort) throw new InvalidCursorError();
  return parsed.data;
}
