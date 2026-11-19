'use client';

import { useShortcut, useShortcutsHelp } from './HotkeysProvider';
import { isEditableTarget, type Shortcut } from './shortcutRules';

const HELP_SHORTCUT = {
  id: 'help',
  keys: '?',
  description: 'Show keyboard shortcuts',
  scope: 'General',
} satisfies Shortcut;

const ESCAPE_SHORTCUT = {
  id: 'escape',
  keys: 'esc',
  description: 'Blur the focused input or close a dialog',
  scope: 'General',
} satisfies Shortcut;

function blurEditableElement() {
  if (isEditableTarget(document.activeElement) && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

export function GlobalShortcuts() {
  const help = useShortcutsHelp();

  function toggleHelp() {
    help.setOpen(!help.isOpen);
  }

  useShortcut(HELP_SHORTCUT, toggleHelp);
  useShortcut(ESCAPE_SHORTCUT, blurEditableElement);
  return null;
}
