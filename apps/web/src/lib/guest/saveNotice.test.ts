import { describe, expect, it } from 'vitest';
import { saveNotice, type SaveNoticeKind } from './saveNotice';

const NONE = new Set<SaveNoticeKind>();

describe('saveNotice', () => {
  it('AC-1.4.1 announces a first save with the sign-in hint', () => {
    expect(saveNotice({ outcome: 'added', memoryOnly: false, alreadyShown: NONE })).toEqual({
      kind: 'saved-on-device',
      message: 'Saved on this device · Sign in to sync',
    });
  });

  it('AC-1.4.1 stays quiet once the notice was shown this session', () => {
    const shown = new Set<SaveNoticeKind>(['saved-on-device']);
    expect(saveNotice({ outcome: 'added', memoryOnly: false, alreadyShown: shown })).toBeNull();
  });

  it('says nothing when a story is unsaved', () => {
    expect(saveNotice({ outcome: 'removed', memoryOnly: false, alreadyShown: NONE })).toBeNull();
  });

  it('AC-1.4.4 warns once that storage is unavailable, then falls back to the normal notice', () => {
    const first = saveNotice({ outcome: 'added', memoryOnly: true, alreadyShown: NONE });
    expect(first?.kind).toBe('storage-unavailable');
    const shown = new Set<SaveNoticeKind>(['storage-unavailable']);
    expect(saveNotice({ outcome: 'added', memoryOnly: true, alreadyShown: shown })?.kind).toBe(
      'saved-on-device',
    );
  });

  it('always explains a refused save', () => {
    const shown = new Set<SaveNoticeKind>(['full']);
    expect(saveNotice({ outcome: 'full', memoryOnly: false, alreadyShown: shown })?.kind).toBe(
      'full',
    );
  });
});
