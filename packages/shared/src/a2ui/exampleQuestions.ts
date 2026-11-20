/** The command bar's suggested questions, which are also the example briefing generator's input. */
export const EXAMPLE_QUESTIONS = [
  { slug: 'ts-tooling-debates', question: "What were this week's TypeScript tooling debates?" },
  { slug: 'ai-tooling-launches', question: 'What were the biggest AI tooling launches this week?' },
  { slug: 'rust-vs-go', question: 'Rust vs Go: what are teams choosing this week?' },
] as const;

export type ExampleQuestion = (typeof EXAMPLE_QUESTIONS)[number];
