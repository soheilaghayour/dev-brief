import Link from 'next/link';
import { MenuIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/layout/Logo';
import { ThemeToggle } from './lazyIslands';
import { SIGN_IN_PATH, getLandingNav } from './landingLinks';

const NAV_LINK_CLASS =
  'text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors';

export function SiteHeader() {
  const links = getLandingNav();
  return (
    <header className="bg-background/70 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        {/* A native disclosure: a sheet would add client JS to a page that is otherwise static. */}
        <details className="group relative md:hidden">
          <summary
            aria-label="Menu"
            className="hover:bg-accent flex size-8 cursor-pointer list-none items-center justify-center rounded-md [&::-webkit-details-marker]:hidden"
          >
            <MenuIcon className="size-4" aria-hidden="true" />
          </summary>
          <nav
            aria-label="Mobile"
            className="bg-popover absolute top-10 left-0 grid w-56 gap-1 rounded-lg border p-2 text-base shadow-lg"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:bg-accent rounded-md px-3 py-2 font-medium"
              >
                {link.label}
              </Link>
            ))}
            <Link href={SIGN_IN_PATH} className="hover:bg-accent rounded-md px-3 py-2 font-medium">
              Sign in
            </Link>
          </nav>
        </details>
        <Logo />
        <nav aria-label="Main" className="mx-auto hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={NAV_LINK_CLASS}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="max-md:hidden">
            <Link href={SIGN_IN_PATH}>Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/feed">Explore feed</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
