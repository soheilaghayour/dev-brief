'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { LAUNCHER_SIZE } from './launcherSize';

// The bar, the renderer and the stream parser are fetched the first time the bar opens.
const CopilotCommandBar = dynamic(
  () => import('./CopilotCommandBar').then((module) => module.CopilotCommandBar),
  { ssr: false },
);

/** The header's Ask button, which opens the command bar; the bar itself loads on first open. */
export function CopilotLauncher() {
  const [isOpen, setOpen] = useState(false);
  // A new key remounts the bar on each open, so each starts empty.
  const [openCount, setOpenCount] = useState(0);
  const button = useRef<HTMLButtonElement>(null);

  function open() {
    if (!isOpen) setOpenCount((count) => count + 1);
    setOpen(true);
  }

  return (
    <>
      <Button
        ref={button}
        variant="outline"
        size="sm"
        className={cn(LAUNCHER_SIZE, 'max-md:px-0')}
        aria-haspopup="dialog"
        onClick={open}
      >
        <SparklesIcon aria-hidden="true" />
        {/* Below md the header has room for an icon only; the name stays for screen readers. */}
        <span className="max-md:sr-only">Ask</span>
      </Button>
      {openCount > 0 && (
        <CopilotCommandBar
          key={openCount}
          open={isOpen}
          onOpenChange={setOpen}
          returnFocusTo={() => button.current}
        />
      )}
    </>
  );
}
