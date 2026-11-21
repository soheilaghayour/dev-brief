// The enabled sources (PRD §2.1 row 2); the RSS blogs are off (§8.8).
const SOURCES = ['Hacker News', 'Dev.to', 'GitHub'];

export function SourceStrip() {
  return (
    <section aria-label="Sources" className="border-y">
      <p className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-5 font-mono text-xs">
        {SOURCES.map((name, index) => (
          <span key={name} className="inline-flex items-center gap-3">
            {name}
            {index < SOURCES.length - 1 && <span aria-hidden="true">·</span>}
          </span>
        ))}
      </p>
    </section>
  );
}
