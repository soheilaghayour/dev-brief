'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/ToggleGroup';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', Icon: MonitorIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
];

const subscribeToNothing = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The stored theme is unknown on the server; selecting nothing until mount avoids a mismatch.
  const isMounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  function selectTheme(value: string) {
    if (value) setTheme(value);
  }

  return (
    <ToggleGroup
      type="single"
      aria-label="Theme"
      value={isMounted ? theme : ''}
      onValueChange={selectTheme}
    >
      {THEME_OPTIONS.map(({ value, label, Icon }) => (
        <ToggleGroupItem key={value} value={value} aria-label={label} title={label}>
          <Icon />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
