import type { ReactNode } from 'react';

type SectionHeadingProps = { id: string; eyebrow: string; title: string; children?: ReactNode };

export function SectionHeading({ id, eyebrow, title, children }: SectionHeadingProps) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        {title}
      </h2>
      {children && <p className="text-muted-foreground mt-4 text-base text-balance">{children}</p>}
    </div>
  );
}
