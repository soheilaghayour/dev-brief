import { SectionHeading } from './SectionHeading';

const PROBLEMS = [
  {
    title: 'Same story, five tabs',
    text: 'A release lands on HN, Dev.to and three blogs. You read about it five times.',
    mock: ['HN', 'Dev.to', 'Blog', 'Blog', 'Blog'],
  },
  {
    title: "Rankings you can't trust",
    text: "300 HN points and 40 Dev.to reactions aren't comparable. We normalise them.",
    mock: ['300 pts', '40 ♥'],
  },
  {
    title: 'Signal buried in comments',
    text: 'The real trade-offs live in thread #212.',
    mock: ['#1', '#2', '…', '#212'],
  },
];

export function ProblemSection() {
  return (
    <section aria-labelledby="problem-title" className="mx-auto max-w-6xl px-4 py-20">
      <SectionHeading
        id="problem-title"
        eyebrow="The problem"
        title="Keeping up costs more than it should"
      />
      <div className="grid gap-4 md:grid-cols-3">
        {PROBLEMS.map((problem) => (
          <article
            key={problem.title}
            className="bg-card hover:border-primary/40 group rounded-lg border p-5 transition-colors"
          >
            <div aria-hidden="true" className="mb-5 flex flex-wrap gap-1.5 font-mono text-[11px]">
              {problem.mock.map((chip, index) => (
                <span
                  key={index}
                  className="bg-muted text-muted-foreground group-hover:text-foreground rounded-sm border px-1.5 py-0.5 transition-colors"
                >
                  {chip}
                </span>
              ))}
            </div>
            <h3 className="text-base font-semibold tracking-tight">{problem.title}</h3>
            <p className="text-muted-foreground mt-2 text-base">{problem.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
