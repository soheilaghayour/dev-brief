import { ChevronDownIcon } from 'lucide-react';
import { REPO_URL } from './landingLinks';
import { SectionHeading } from './SectionHeading';

const FAQ = [
  {
    question: 'Do I need an account?',
    answer:
      'No. The feed, filters, search and saves all work as a guest; saves stay on your device. Sign in with GitHub or Google only if you want them to sync across devices.',
  },
  {
    question: 'How are stories ranked?',
    answer:
      'Engagement is compared within each source over the last 7 days, so Hacker News points, Dev.to reactions and GitHub stars land on one scale, then blended with how recent the story is. The formula is public.',
  },
  {
    question: 'What data do you store?',
    answer:
      'Guests: nothing on our side; saves and your theme live in your browser. Signed-in users: your name, verified email, avatar and saved stories. Only the session cookie is used, no tracking and no cookie banner.',
  },
  {
    question: 'Does it cost anything?',
    answer: 'No. DevBrief is free to use and runs on a single small VPS.',
  },
  {
    question: 'Is it open source?',
    answer: 'Yes. The code, the PRD and the decision log are public on GitHub.',
    link: { href: REPO_URL, label: 'Read the code' },
  },
];

export function FaqSection() {
  return (
    <section aria-labelledby="faq-title" className="mx-auto max-w-3xl px-4 py-20">
      <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered" />
      <div className="divide-y rounded-lg border">
        {FAQ.map((item) => (
          <details key={item.question} name="faq" className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-base font-medium [&::-webkit-details-marker]:hidden">
              {item.question}
              <ChevronDownIcon
                className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="text-muted-foreground mt-3 text-base">
              {item.answer}{' '}
              {item.link && (
                <a href={item.link.href} className="text-foreground underline underline-offset-4">
                  {item.link.label}
                </a>
              )}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
