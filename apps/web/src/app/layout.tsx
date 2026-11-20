import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { LazyToaster } from '@/components/layout/LazyToaster';
import { HotkeysProvider } from '@/lib/hotkeys/HotkeysProvider';
import { loadAppOrigin } from '@/env';
import './globals.css';

const fontSans = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-geist-sans' });
const fontMono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-geist-mono' });

export const metadata: Metadata = {
  metadataBase: loadAppOrigin(),
  title: { default: 'DevBrief', template: '%s · DevBrief' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // next-themes sets the theme class on <html> before first paint, which React must not undo.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable}`}
    >
      <body>
        <ThemeProvider>
          <HotkeysProvider>
            {children}
            <LazyToaster />
          </HotkeysProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
