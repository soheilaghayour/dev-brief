'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { shouldRunShortcut, type Shortcut } from './shortcutRules';

export type ShortcutBinding = {
  shortcut: Shortcut;
  handlerRef: RefObject<(event: KeyboardEvent) => void>;
};

function Binding({
  shortcut,
  handlerRef,
  leaderPending,
}: ShortcutBinding & { leaderPending: RefObject<boolean> }) {
  useHotkeys(
    shortcut.keys,
    (event) => {
      if (shouldRunShortcut(shortcut.keys, event.target, leaderPending.current)) {
        handlerRef.current(event);
      }
    },
    // The editable-element rule lives in shouldRunShortcut so Esc and combos can differ.
    { useKey: true, enableOnFormTags: true, enableOnContentEditable: true },
  );
  return null;
}

/** Binds every registered shortcut; kept apart from the registry so the hook library loads lazily. */
export function ShortcutBindings({
  bindings,
  leaderPending,
}: {
  bindings: readonly ShortcutBinding[];
  leaderPending: RefObject<boolean>;
}) {
  // Lets e2e tests wait until the lazily loaded hook has bound the shortcuts registered during hydration.
  const hasBindings = bindings.length > 0;
  useEffect(() => {
    if (hasBindings) document.documentElement.dataset.hotkeysReady = '';
  }, [hasBindings]);

  return bindings.map(({ shortcut, handlerRef }) => (
    <Binding
      key={shortcut.id}
      shortcut={shortcut}
      handlerRef={handlerRef}
      leaderPending={leaderPending}
    />
  ));
}
