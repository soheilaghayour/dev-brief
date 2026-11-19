export type Shortcut = {
  id: string;
  /** react-hotkeys-hook syntax: `j`, `?`, `g>f` (sequence), `mod+k` (combination). */
  keys: string;
  description: string;
  scope: string;
};

const MODIFIERS = ['mod', 'ctrl', 'meta', 'alt'];
const ESCAPE_KEYS = ['esc', 'escape'];

/** True for an input, textarea, select or contenteditable element. */
export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return (
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !==
    null
  );
}

function isSingleKey(keys: string) {
  const parts = keys.toLowerCase().split(/[+>]/);
  return !parts.some((part) => MODIFIERS.includes(part) || ESCAPE_KEYS.includes(part));
}

/** How long after a sequence's first key its second key still counts (the hook's default). */
export const SEQUENCE_TIMEOUT_MS = 1000;

/** True when some registered sequence starts with this key, e.g. `g` for `g>s`. */
export function isSequenceLeader(key: string, shortcuts: readonly Shortcut[]) {
  const leader = `${key.toLowerCase()}>`;
  return shortcuts.some(({ keys }) => keys.toLowerCase().startsWith(leader));
}

/**
 * Single-key shortcuts stay quiet while the user types or while a sequence is half typed
 * (`g` then `s` must not also fire a plain `s`); Esc, modifier combos and sequences always run.
 */
export function shouldRunShortcut(keys: string, target: EventTarget | null, leaderPending = false) {
  if (!isSingleKey(keys)) return true;
  if (isEditableTarget(target)) return false;
  return isSequence(keys) || !leaderPending;
}

/** Splits a shortcut into the key caps to show, e.g. `g>f` becomes `['g', 'f']`. */
export function displayKeys(keys: string) {
  return keys.split(/[+>]/).map((part) => {
    if (part === 'mod') return '⌘';
    if (ESCAPE_KEYS.includes(part.toLowerCase())) return 'Esc';
    return part;
  });
}

export function isSequence(keys: string) {
  return keys.includes('>');
}
