'use client';

import { Button } from '@/components/ui/Button';

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground">An unexpected error occurred. Try again in a moment.</p>
      <Button onClick={retry}>Try again</Button>
    </main>
  );
}
