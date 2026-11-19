'use client';

import dynamic from 'next/dynamic';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { GlobalShortcuts } from './GlobalShortcuts';
import {
  isSequenceLeader,
  SEQUENCE_TIMEOUT_MS,
  shouldRunShortcut,
  type Shortcut,
} from './shortcutRules';

// The dialog (and Radix Dialog with it) is only fetched the first time it is opened.
const ShortcutsHelpDialog = dynamic(() =>
  import('./ShortcutsHelpDialog').then((module) => module.ShortcutsHelpDialog),
);

type HelpState = { isOpen: boolean; setOpen: (open: boolean) => void };

const ShortcutsContext = createContext<readonly Shortcut[]>([]);
const RegisterContext = createContext<(shortcut: Shortcut) => () => void>(() => () => {});
const HelpContext = createContext<HelpState>({ isOpen: false, setOpen: () => {} });
/** True while the key being handled follows a sequence's first key, e.g. the `s` of `g` then `s`. */
const LeaderPendingContext = createContext<{ current: boolean }>({ current: false });

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
  const leaderPending = useRef(false);

  useEffect(() => {
    let leaderAt: number | null = null;
    // Capture phase: runs before the shortcut handlers, which read `leaderPending` for this event.
    function trackLeader(event: KeyboardEvent) {
      leaderPending.current = leaderAt !== null && event.timeStamp - leaderAt < SEQUENCE_TIMEOUT_MS;
      leaderAt = isSequenceLeader(event.key, shortcuts) ? event.timeStamp : null;
    }
    document.addEventListener('keydown', trackLeader, true);
    return () => document.removeEventListener('keydown', trackLeader, true);
  }, [shortcuts]);

  return (
    <RegisterContext value={register}>
      <ShortcutsContext value={shortcuts}>
        <HelpContext value={help}>
          <LeaderPendingContext value={leaderPending}>
            <GlobalShortcuts />
            {children}
            {hasOpenedHelp && <ShortcutsHelpDialog />}
          </LeaderPendingContext>
        </HelpContext>
      </ShortcutsContext>
    </RegisterContext>
  );
}

/** Registers a shortcut in the help list and binds its handler; pass a module-level `shortcut`. */
export function useShortcut(shortcut: Shortcut, handler: (event: KeyboardEvent) => void) {
  const register = useContext(RegisterContext);
  const leaderPending = useContext(LeaderPendingContext);
  useEffect(() => register(shortcut), [register, shortcut]);
  useHotkeys(
    shortcut.keys,
    (event) => {
      if (shouldRunShortcut(shortcut.keys, event.target, leaderPending.current)) handler(event);
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
