'use client';

import type { ComponentProps, CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { Toaster as SonnerToaster } from 'sonner';

type ToasterTheme = 'light' | 'dark' | 'system';

function isToasterTheme(value: string | undefined): value is ToasterTheme {
  return value === 'light' || value === 'dark' || value === 'system';
}

// Sonner renders an aria-live region, so toasts are announced to screen readers.
function Toaster(props: ComponentProps<typeof SonnerToaster>) {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={isToasterTheme(theme) ? theme : 'system'}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
