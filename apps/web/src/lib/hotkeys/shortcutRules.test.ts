// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { displayKeys, isSequence, isSequenceLeader, shouldRunShortcut } from './shortcutRules';

function element(markup: string) {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.firstElementChild;
}

describe('shouldRunShortcut', () => {
  it('AC-1.3.8 ignores single-key shortcuts while focus is in a text input', () => {
    const input = element('<input type="text">');
    expect(shouldRunShortcut('j', input)).toBe(false);
    expect(shouldRunShortcut('?', input)).toBe(false);
    expect(shouldRunShortcut('g>f', input)).toBe(false);
  });

  it('AC-1.3.8 ignores single-key shortcuts in a textarea, select and contenteditable', () => {
    expect(shouldRunShortcut('j', element('<textarea></textarea>'))).toBe(false);
    expect(shouldRunShortcut('j', element('<select></select>'))).toBe(false);
    expect(shouldRunShortcut('j', element('<div contenteditable="true"></div>'))).toBe(false);
  });

  it('AC-1.3.8 still runs Esc and modifier combinations inside an input', () => {
    const input = element('<input type="text">');
    expect(shouldRunShortcut('esc', input)).toBe(true);
    expect(shouldRunShortcut('mod+k', input)).toBe(true);
  });

  it('runs single-key shortcuts on non-editable targets', () => {
    expect(shouldRunShortcut('j', element('<button></button>'))).toBe(true);
    expect(shouldRunShortcut('j', document.body)).toBe(true);
    expect(shouldRunShortcut('j', null)).toBe(true);
  });
});

describe('shouldRunShortcut inside a menu', () => {
  it('AC-2.5.1 ignores single keys, Enter included, while focus is in an open menu', () => {
    const item = element(
      '<div role="menu"><div role="menuitemcheckbox"></div></div>',
    )?.firstElementChild;
    for (const keys of ['j', 'k', 'o', 'c', 's', 't', 'enter']) {
      expect(shouldRunShortcut(keys, item ?? null)).toBe(false);
    }
    expect(shouldRunShortcut('esc', item ?? null)).toBe(true);
  });
});

describe('sequence leaders', () => {
  const shortcuts = [
    { id: 'saved', keys: 'g>s', description: 'Go to Saved', scope: 'Go to' },
    { id: 'save', keys: 's', description: 'Save', scope: 'Feed' },
  ];

  it('knows which keys start a registered sequence', () => {
    expect(isSequenceLeader('g', shortcuts)).toBe(true);
    expect(isSequenceLeader('G', shortcuts)).toBe(true);
    expect(isSequenceLeader('s', shortcuts)).toBe(false);
  });

  it('AC-1.3.8 a single key right after a sequence leader does not run', () => {
    expect(shouldRunShortcut('s', document.body, true)).toBe(false);
    expect(shouldRunShortcut('g>s', document.body, true)).toBe(true);
    expect(shouldRunShortcut('esc', document.body, true)).toBe(true);
    expect(shouldRunShortcut('s', document.body, false)).toBe(true);
  });
});

describe('displayKeys', () => {
  it('splits sequences and combinations into key caps', () => {
    expect(displayKeys('g>f')).toEqual(['g', 'f']);
    expect(displayKeys('mod+k')).toEqual(['⌘', 'k']);
    expect(displayKeys('esc')).toEqual(['Esc']);
  });

  it('tells sequences from combinations', () => {
    expect(isSequence('g>f')).toBe(true);
    expect(isSequence('mod+k')).toBe(false);
  });
});
