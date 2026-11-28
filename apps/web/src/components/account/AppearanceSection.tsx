'use client';

import { useSyncExternalStore } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', Icon: MonitorIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
];

const subscribeToNothing = () => () => {};

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  // The stored theme is unknown on the server; selecting nothing until mount avoids a mismatch.
  const isMounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const selected = isMounted ? theme : undefined;
  // Roving tabindex: one tab stop, on the selected option (or the first while unknown).
  const tabStop = THEME_OPTIONS.some(({ value }) => value === selected) ? selected : 'system';

  function moveSelection(event: KeyboardEvent<HTMLElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = THEME_OPTIONS.findIndex(({ value }) => value === tabStop);
    const next = THEME_OPTIONS.at((current + step) % THEME_OPTIONS.length);
    if (!next) return;
    setTheme(next.value);
    event.currentTarget.parentElement
      ?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)
      ?.focus();
  }

  return (
    <section aria-labelledby="appearance-heading" className="flex flex-col gap-3">
      <h2 id="appearance-heading" className="text-sm font-medium">
        Appearance
      </h2>
      <div>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="bg-muted inline-flex items-center gap-0.5 rounded-md border p-0.5"
        >
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <ThemeOption
              key={value}
              value={value}
              label={label}
              isChecked={selected === value}
              isTabStop={tabStop === value}
              onSelect={setTheme}
              onKeyDown={moveSelection}
            >
              <Icon />
            </ThemeOption>
          ))}
        </div>
      </div>
    </section>
  );
}

type ThemeOptionProps = {
  value: string;
  label: string;
  isChecked: boolean;
  isTabStop: boolean;
  onSelect: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  children: ReactNode;
};

function ThemeOption({
  value,
  label,
  isChecked,
  isTabStop,
  onSelect,
  onKeyDown,
  children,
}: ThemeOptionProps) {
  function select() {
    onSelect(value);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      role="radio"
      aria-checked={isChecked}
      aria-label={label}
      title={label}
      data-value={value}
      tabIndex={isTabStop ? 0 : -1}
      onClick={select}
      onKeyDown={onKeyDown}
      className={cn(
        'text-muted-foreground size-7 rounded-sm',
        isChecked && 'bg-background text-foreground shadow-sm',
      )}
    >
      {children}
    </Button>
  );
}
