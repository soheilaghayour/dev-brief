'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/Button';

// CSS picks the icon and name from the `dark` class, so nothing swaps after hydration.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  function switchTheme() {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }

  return (
    <Button variant="ghost" size="icon" onClick={switchTheme}>
      <SunIcon className="dark:hidden" />
      <MoonIcon className="hidden dark:block" />
      <span className="sr-only dark:hidden">Switch to dark theme</span>
      <span className="sr-only hidden dark:block">Switch to light theme</span>
    </Button>
  );
}
