'use client';

import { Fragment } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Kbd } from '@/components/ui/Kbd';
import { useRegisteredShortcuts, useShortcutsHelp } from './HotkeysProvider';
import { displayKeys, isSequence, type Shortcut } from './shortcutRules';

function groupByScope(shortcuts: readonly Shortcut[]) {
  const groups = new Map<string, Shortcut[]>();
  for (const shortcut of shortcuts) {
    groups.set(shortcut.scope, [...(groups.get(shortcut.scope) ?? []), shortcut]);
  }
  return [...groups];
}

function ShortcutKeys({ keys }: { keys: string }) {
  const caps = displayKeys(keys);
  const separator = isSequence(keys) ? 'then' : '+';
  return (
    <span className="text-muted-foreground flex items-center gap-1 text-xs">
      {caps.map((cap, index) => (
        <Fragment key={cap}>
          {index > 0 && <span>{separator}</span>}
          <Kbd>{cap}</Kbd>
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutsHelpDialog() {
  const shortcuts = useRegisteredShortcuts();
  const help = useShortcutsHelp();

  return (
    <Dialog open={help.isOpen} onOpenChange={help.setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single-key shortcuts pause while you type.</DialogDescription>
        </DialogHeader>
        {groupByScope(shortcuts).map(([scope, group]) => (
          <section key={scope} aria-label={scope} className="grid gap-1.5">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {scope}
            </h3>
            <ul className="grid gap-1">
              {group.map((shortcut) => (
                <li key={shortcut.id} className="flex items-center justify-between gap-4">
                  <span>{shortcut.description}</span>
                  <ShortcutKeys keys={shortcut.keys} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
