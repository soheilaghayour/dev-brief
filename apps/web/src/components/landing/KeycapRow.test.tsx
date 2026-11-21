import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '@/config/features';
import { KeycapRow, pressedKeycap, visibleKeycaps } from './KeycapRow';

const ON = { ...FEATURES, copilot: true };
const OFF = { ...FEATURES, copilot: false };

const press = (key: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...modifiers,
});

describe('KeycapRow', () => {
  it('AC-L7 shows the ⌘K keycap only while the copilot flag is on', () => {
    expect(visibleKeycaps(OFF)).toHaveLength(5);
    expect(renderToStaticMarkup(<KeycapRow features={OFF} />)).not.toContain('⌘K');
    expect(visibleKeycaps(ON)).toHaveLength(6);
    expect(renderToStaticMarkup(<KeycapRow features={ON} />)).toContain('⌘K');
  });

  it('AC-L7 lights ⌘K for Cmd+K or Ctrl+K and the letter keycap for a bare k', () => {
    const keycaps = visibleKeycaps(ON);
    expect(pressedKeycap(press('k', { metaKey: true }), keycaps)?.display).toBe('⌘K');
    expect(pressedKeycap(press('k', { ctrlKey: true }), keycaps)?.display).toBe('⌘K');
    expect(pressedKeycap(press('k'), keycaps)?.display).toBeUndefined();
    expect(pressedKeycap(press('j', { metaKey: true }), keycaps)).toBeUndefined();
  });

  it('AC-L7 ignores Cmd+K while the flag is off', () => {
    expect(pressedKeycap(press('k', { metaKey: true }), visibleKeycaps(OFF))).toBeUndefined();
  });
});
