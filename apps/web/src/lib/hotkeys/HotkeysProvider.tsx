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
import { GlobalShortcuts } from './GlobalShortcuts';
import {
  isEditableTarget,
  isModalOpen,
  isSequenceLeader,
  SEQUENCE_TIMEOUT_MS,
  type Shortcut,
} from './shortcutRules';
import type { ShortcutBinding } from './ShortcutBindings';

// react-hotkeys-hook is fetched after hydration: keys are only pressed once the page is up.
const ShortcutBindings = dynamic(
  () => import('./ShortcutBindings').then((module) => module.ShortcutBindings),
  { ssr: false },
);

// The dialog (and Radix Dialog with it) is only fetched the first time it is opened.
const ShortcutsHelpDialog = dynamic(() =>
  import('./ShortcutsHelpDialog').then((module) => module.ShortcutsHelpDialog),
);

const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta'];

type HelpState = { isOpen: boolean; setOpen: (open: boolean) => void };

const ShortcutsContext = createContext<readonly Shortcut[]>([]);
const RegisterContext = createContext<
  (shortcut: Shortcut, handlerRef: ShortcutBinding['handlerRef']) => () => void
>(() => () => {});
const HelpContext = createContext<HelpState>({ isOpen: false, setOpen: () => {} });
/** True while the key being handled follows a sequence's first key, e.g. the `s` of `g` then `s`. */
const LeaderPendingContext = createContext<{ current: boolean }>({ current: false });

export function HotkeysProvider({ children }: { children: ReactNode }) {
  const [bindings, setBindings] = useState<readonly ShortcutBinding[]>([]);
  const shortcuts = useMemo(() => bindings.map(({ shortcut }) => shortcut), [bindings]);
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [hasOpenedHelp, setHasOpenedHelp] = useState(false);

  // One live handler per shortcut id: a later registration replaces the earlier one.
  const register = useCallback((shortcut: Shortcut, handlerRef: ShortcutBinding['handlerRef']) => {
    setBindings((current) => [
      ...current.filter((binding) => binding.shortcut.id !== shortcut.id),
      { shortcut, handlerRef },
    ]);
    return () => setBindings((current) => current.filter((b) => b.shortcut.id !== shortcut.id));
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setHelpOpen(open);
    if (open) setHasOpenedHelp(true);
  }, []);

  const help = useMemo(() => ({ isOpen: isHelpOpen, setOpen }), [isHelpOpen, setOpen]);
  const leaderPending = useRef(false);
  // A ref, not an effect-local: a shortcut registering between `g` and `s` re-runs the effect below.
  const leaderAt = useRef<number | null>(null);

  useEffect(() => {
    // Capture phase: runs before the shortcut handlers, which read `leaderPending` for this event.
    function trackLeader(event: KeyboardEvent) {
      // Like the hook, a bare modifier press between the two keys does not break the sequence.
      if (MODIFIER_KEYS.includes(event.key)) return;
      const pending =
        leaderAt.current !== null && event.timeStamp - leaderAt.current < SEQUENCE_TIMEOUT_MS;
      leaderPending.current = pending;
      // A repeated leader cancels, as in the hook (`g g s` runs no sequence); a `g` typed into a field never arms one.
      leaderAt.current =
        !pending &&
        !isModalOpen() &&
        !isEditableTarget(event.target) &&
        isSequenceLeader(event.key, shortcuts)
          ? event.timeStamp
          : null;
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
            <ShortcutBindings bindings={bindings} leaderPending={leaderPending} />
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
  // The latest handler is read at key time, so the binding never rebinds on re-render.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => register(shortcut, handlerRef), [register, shortcut]);
}

export function useRegisteredShortcuts() {
  return useContext(ShortcutsContext);
}

export function useShortcutsHelp() {
  return useContext(HelpContext);
}
