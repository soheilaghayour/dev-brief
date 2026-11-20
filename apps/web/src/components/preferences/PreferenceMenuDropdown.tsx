'use client';

import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import type { PreferenceKind, PreferenceMode, PreferenceValue } from '@/lib/guest/preferences';
import { usePreferences } from './usePreferences';

type PreferenceMenuDropdownProps<K extends PreferenceKind> = {
  kind: K;
  value: PreferenceValue[K];
  label: string;
  /** PreferenceMenu's badge, so both share one markup. */
  trigger: ReactNode;
};

/** The open Follow / Mute menu of a badge; the current mode carries the check. */
export function PreferenceMenuDropdown<K extends PreferenceKind>({
  kind,
  value,
  label,
  trigger,
}: PreferenceMenuDropdownProps<K>) {
  const preferences = usePreferences();
  const mode = preferences.modeOf(kind, value);

  function toggleMode(target: PreferenceMode) {
    preferences.setMode(kind, value, mode === target ? null : target);
  }
  function toggleFollow() {
    toggleMode('follow');
  }
  function toggleMute() {
    toggleMode('mute');
  }

  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={mode === 'follow'} onCheckedChange={toggleFollow}>
          {mode === 'follow' ? 'Unfollow' : 'Follow'}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={mode === 'mute'} onCheckedChange={toggleMute}>
          {mode === 'mute' ? 'Unmute' : 'Mute'}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
