import type { ReactNode } from 'react';

type LegalPageProps = { title: string; children: ReactNode };

export function LegalPage({ title, children }: LegalPageProps) {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p
        role="note"
        className="bg-warning/15 border-warning/40 mt-6 rounded-md border px-4 py-3 text-sm"
      >
        Placeholder — replace before public launch. Bracketed values such as [OPERATOR NAME] are not
        real.
      </p>
      <div className="[&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:text-muted-foreground [&_p]:mt-3 [&_ul]:text-muted-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1.5">
        {children}
      </div>
    </article>
  );
}
