import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { API_DOCS_PATH, CHANGELOG_URL, REPO_URL, SOURCE_STATUS_PATH } from './landingLinks';

const LINK_CLASS = 'text-muted-foreground hover:text-foreground rounded-sm transition-colors';

type SiteFooterProps = { year: number };

export function SiteFooter({ year }: SiteFooterProps) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 md:flex-row md:items-start md:justify-between">
        <div className="grid gap-2">
          <Logo />
          <p className="text-muted-foreground max-w-xs text-sm">
            Developer news from every source, merged, tagged and ranked on one fair scale.
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-3"
        >
          <a href={REPO_URL} className={LINK_CLASS}>
            GitHub
          </a>
          <a href={API_DOCS_PATH} className={LINK_CLASS}>
            API docs
          </a>
          <a href={CHANGELOG_URL} className={LINK_CLASS}>
            Changelog
          </a>
          <Link href={SOURCE_STATUS_PATH} className={LINK_CLASS}>
            Source status
          </Link>
          <Link href="/impressum" className={LINK_CLASS}>
            Impressum
          </Link>
          <Link href="/privacy" className={LINK_CLASS}>
            Privacy (Datenschutz)
          </Link>
        </nav>
      </div>
      <p className="text-muted-foreground mx-auto max-w-6xl px-4 pb-8 text-xs">© {year} DevBrief</p>
    </footer>
  );
}
