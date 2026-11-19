import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, InvalidCursorError } from './cursor.js';

describe('cursor codec', () => {
  it('round-trips a string and a numeric sort key', () => {
    expect(decodeCursor(encodeCursor('top', 12.5, 'abc'), 'top')).toEqual({
      v: 1,
      sort: 'top',
      k: [12.5, 'abc'],
    });
    const latest = encodeCursor('latest', '2026-01-01T00:00:00.000Z', 'ünï');
    expect(decodeCursor(latest, 'latest').k).toEqual(['2026-01-01T00:00:00.000Z', 'ünï']);
  });

  it('is url-safe base64', () => {
    expect(encodeCursor('top', '???>>>', 'id~~')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each(['not a cursor!!', '', 'e30', btoa('{"v":2,"sort":"top","k":[1,"a"]}')])(
    'rejects the malformed cursor %j',
    (cursor) => {
      expect(() => decodeCursor(cursor, 'top')).toThrow(InvalidCursorError);
    },
  );

  it('rejects a cursor issued for another sort', () => {
    expect(() => decodeCursor(encodeCursor('top', 1, 'a'), 'latest')).toThrow(InvalidCursorError);
  });
});
