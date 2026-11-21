'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';

// The bar, the renderer and the stream parser are fetched the first time the bar opens.
const CopilotCommandBar = dynamic(() =>
  import('./CopilotCommandBar').then((module) => module.CopilotCommandBar),
);

const OPEN_COMMAND_BAR = {
  id: 'copilot-open',
  keys: 'mod+k',
  description: 'Open the Ask the News command bar',
  scope: 'Global',
} satisfies Shortcut;

/** The header's "Ask ⌘K" button and the shortcut that opens the command bar; the bar itself loads on first open. */
export function CopilotLauncher() {
  const [isOpen, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  // What had focus when the bar opened: the button, or the field the shortcut was pressed in.
  const openedFrom = useRef<Element | null>(null);

  function open() {
    if (!isOpen) openedFrom.current = document.activeElement;
    setOpen(true);
    setHasOpened(true);
  }

  function openFromShortcut(event: KeyboardEvent) {
    // The browser's own ⌘K / Ctrl+K (a search or link bar) must not also run.
    event.preventDefault();
    open();
  }

  function returnFocus(event: Event) {
    event.preventDefault();
    if (openedFrom.current instanceof HTMLElement) openedFrom.current.focus();
  }

  useShortcut(OPEN_COMMAND_BAR, openFromShortcut);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={open}
      >
        <SparklesIcon aria-hidden="true" />
        Ask
        <Kbd size="sm" className="max-md:hidden">
          ⌘K
        </Kbd>
      </Button>
      {hasOpened && (
        <CopilotCommandBar open={isOpen} onOpenChange={setOpen} onCloseAutoFocus={returnFocus} />
      )}
    </>
  );
}
