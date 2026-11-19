'use client';

import { Button } from '@/components/ui/Button';
import './globals.css';

// Replaces the root layout, so it brings its own <html>; the theme class cannot be restored here.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-muted-foreground">DevBrief hit an unexpected error.</p>
          <Button onClick={retry}>Try again</Button>
        </main>
      </body>
    </html>
  );
}
