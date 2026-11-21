import { describe, expect, it } from 'vitest';
import { FEATURES } from '@/config/features';
import { guestHintSyncText } from './guestHintCopy';

describe('guestHintSyncText', () => {
  it('AC-L7 names collections and notes only while the collections flag is on', () => {
    expect(guestHintSyncText({ ...FEATURES, collections: true })).toBe(
      'to sync anywhere, including collections and notes.',
    );
    expect(guestHintSyncText({ ...FEATURES, collections: false })).toBe('to sync anywhere.');
  });
});
