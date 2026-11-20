import { API_DOCS_PATH, CHANGELOG_URL, PRD_URL, REPO_URL } from './landingLinks';
import { SectionHeading } from './SectionHeading';

const STACK = ['Next.js', 'NestJS', 'Prisma', 'PostgreSQL', 'TanStack Query', 'Tailwind CSS'];

const LINKS = [
  { label: 'GitHub repo', href: REPO_URL },
  { label: 'Product requirements', href: PRD_URL },
  { label: 'OpenAPI docs', href: API_DOCS_PATH },
  { label: 'Changelog', href: CHANGELOG_URL },
];

const ARCHITECTURE = ['Sources', 'Ingestion', 'PostgreSQL', 'NestJS API', 'Next.js'];

export function UnderTheHoodSection() {
  return (
    <section aria-labelledby="hood-title" className="mx-auto max-w-6xl px-4 py-20">
      <SectionHeading id="hood-title" eyebrow="Under the hood" title="Typed end to end">
        Next.js + NestJS + PostgreSQL on a single €5 VPS. Read the PRD.
      </SectionHeading>
      <div className="bg-card mx-auto max-w-3xl rounded-lg border p-6">
        <ol
          aria-label="Architecture"
          className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs"
        >
          {ARCHITECTURE.map((part, index) => (
            <li key={part} className="flex items-center gap-2">
              <span className="bg-muted rounded-md border px-2.5 py-1.5">{part}</span>
              {index < ARCHITECTURE.length - 1 && (
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
        <ul aria-label="Stack" className="mt-6 flex flex-wrap justify-center gap-2">
          {STACK.map((name) => (
            <li key={name} className="text-muted-foreground rounded-full border px-3 py-1 text-sm">
              {name}
            </li>
          ))}
        </ul>
        <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} className="rounded-sm underline underline-offset-4">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Built end-to-end by one engineer.
        </p>
      </div>
    </section>
  );
}
