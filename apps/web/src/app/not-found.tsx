import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-muted-foreground font-mono text-xs">404</p>
      <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">That page does not exist or has moved.</p>
      <Button asChild>
        <Link href="/feed">Go to the feed</Link>
      </Button>
    </main>
  );
}
