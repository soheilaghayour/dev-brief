'use client';

import dynamic from 'next/dynamic';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { GlobalShortcuts } from './GlobalShortcuts';
import { shouldRunShortcut, type Shortcut } from './shortcutRules';

// The dialog (and Radix Dialog with it) is only fetched the first time it is opened.
const ShortcutsHelpDialog = dynamic(() =>
  import('./ShortcutsHelpDialog').then((module) => module.ShortcutsHelpDialog),
);

type HelpState = { isOpen: boolean; setOpen: (open: boolean) => void };

const ShortcutsContext = createContext<readonly Shortcut[]>([]);
const RegisterContext = createContext<(shortcut: Shortcut) => () => void>(() => () => {});
const HelpContext = createContext<HelpState>({ isOpen: false, setOpen: () => {} });

export function HotkeysProvider({ children }: { children: ReactNode }) {
  const [shortcuts, setShortcuts] = useState<readonly Shortcut[]>([]);
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [hasOpenedHelp, setHasOpenedHelp] = useState(false);

  const register = useCallback((shortcut: Shortcut) => {
    setShortcuts((current) => [...current.filter(({ id }) => id !== shortcut.id), shortcut]);
    return () => setShortcuts((current) => current.filter(({ id }) => id !== shortcut.id));
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setHelpOpen(open);
    if (open) setHasOpenedHelp(true);
  }, []);

  const help = useMemo(() => ({ isOpen: isHelpOpen, setOpen }), [isHelpOpen, setOpen]);

  return (
    <RegisterContext value={register}>
      <ShortcutsContext value={shortcuts}>
        <HelpContext value={help}>
          <GlobalShortcuts />
          {children}
          {hasOpenedHelp && <ShortcutsHelpDialog />}
        </HelpContext>
      </ShortcutsContext>
    </RegisterContext>
  );
}

/** Registers a shortcut in the help list and binds its handler; pass a module-level `shortcut`. */
export function useShortcut(shortcut: Shortcut, handler: (event: KeyboardEvent) => void) {
  const register = useContext(RegisterContext);
  useEffect(() => register(shortcut), [register, shortcut]);
  useHotkeys(
    shortcut.keys,
    (event) => {
      if (shouldRunShortcut(shortcut.keys, event.target)) handler(event);
    },
    // The editable-element rule lives in shouldRunShortcut so Esc and combos can differ.
    { useKey: true, enableOnFormTags: true, enableOnContentEditable: true },
  );
}

export function useRegisteredShortcuts() {
  return useContext(ShortcutsContext);
}

export function useShortcutsHelp() {
  return useContext(HelpContext);
}
