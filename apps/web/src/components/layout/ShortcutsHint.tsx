'use client';

import { KeyboardIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { useShortcutsHelp } from '@/lib/hotkeys/HotkeysProvider';

export function ShortcutsHint() {
  const help = useShortcutsHelp();

  function openHelp() {
    help.setOpen(true);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground w-full justify-start"
      onClick={openHelp}
    >
      <KeyboardIcon />
      <span className="flex-1 text-left">Keyboard shortcuts</span>
      <Kbd>?</Kbd>
    </Button>
  );
}
