'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/Button';

// The theme in use is known only in the browser, so the `.dark` class set by the inline theme
// script picks the icon and the name through CSS: both are in the HTML and none swaps after hydration.
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
