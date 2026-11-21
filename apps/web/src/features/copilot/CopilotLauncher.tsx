'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/lib/cn';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';
import { LAUNCHER_SIZE } from './launcherSize';

// The bar, the renderer and the stream parser are fetched the first time the bar opens.
const CopilotCommandBar = dynamic(
  () => import('./CopilotCommandBar').then((module) => module.CopilotCommandBar),
  { ssr: false },
);

const OPEN_COMMAND_BAR = {
  id: 'copilot-open',
  keys: 'mod+k',
  description: 'Open the Ask the News command bar',
  scope: 'Global',
} satisfies Shortcut;

/** One open of the bar: a new one remounts it, so each starts empty and remembers its own opener. */
type Opening = { id: number; opener: Element | null };

/** The header's "Ask ⌘K" button and the shortcut that opens the command bar; the bar itself loads on first open. */
export function CopilotLauncher() {
  const [isOpen, setOpen] = useState(false);
  const [opening, setOpening] = useState<Opening>();
  const button = useRef<HTMLButtonElement>(null);
  // The launcher renders on the client only, so the platform is known here.
  const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

  function open() {
    if (!isOpen) {
      // What has focus now: the button, or the field the shortcut was pressed in.
      const opener = document.activeElement;
      setOpening((previous) => ({ id: (previous?.id ?? 0) + 1, opener }));
    }
    setOpen(true);
  }

  function openFromShortcut(event: KeyboardEvent) {
    // The browser's own ⌘K / Ctrl+K (a search or link bar) must not also run.
    event.preventDefault();
    open();
  }

  useShortcut(OPEN_COMMAND_BAR, openFromShortcut);

  return (
    <>
      <Button
        ref={button}
        variant="outline"
        size="sm"
        className={cn(LAUNCHER_SIZE, 'max-md:px-0')}
        aria-haspopup="dialog"
        aria-keyshortcuts={isApple ? 'Meta+K' : 'Control+K'}
        onClick={open}
      >
        <SparklesIcon aria-hidden="true" />
        {/* Below md the header has room for an icon only; the name stays for screen readers. */}
        <span className="max-md:sr-only">Ask</span>
        <Kbd size="sm" className="max-md:hidden">
          {isApple ? '⌘K' : 'Ctrl K'}
        </Kbd>
      </Button>
      {opening && (
        <CopilotCommandBar
          key={opening.id}
          open={isOpen}
          onOpenChange={setOpen}
          opener={opening.opener}
          fallbackFocus={() => button.current}
        />
      )}
    </>
  );
}
