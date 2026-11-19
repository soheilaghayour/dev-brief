import { describe, expect, it } from 'vitest';
import { tagStory } from './tagStory.js';
import { TAG_SLUGS, TAXONOMY, TAXONOMY_VERSION, type TagSlug } from './taxonomy.js';

function tagTitle(title: string) {
  return tagStory({ title, url: 'https://example.com/post', sourceTags: [], categories: [] });
}

// Per tag: at least 3 titles that must carry it and 2 that must not.
const CASES = {
  react: {
    positive: [
      'React 19 is out',
      'Why Next.js won the framework wars',
      'Building apps with React Native',
    ],
    negative: ['React to criticism', 'Reacting to change at work', 'Reactive programming in Java'],
  },
  vue: {
    positive: ['Vue 3.5 released', 'Nuxt 4 is here', 'State patterns with Pinia'],
    negative: ['Vuetify theming notes', 'Avenue of ideas'],
  },
  typescript: {
    positive: ['TypeScript 6.0 released', 'Fixing tsconfig paths', 'Deno 3 ships'],
    negative: ['Typewriters and writers', 'ts is only a source tag'],
  },
  javascript: {
    positive: ['JavaScript fatigue', 'Node.js 26 release notes', 'Bun 2 is fast to start'],
    negative: ['Java streams explained', 'JSON schema tips'],
  },
  'ai-llms': {
    positive: ['AI agents in production', 'Claude ships a new model', 'Fine-tuning LLMs with RAG'],
    negative: ['Agents of change in the office', 'Why mountain air matters'],
  },
  'system-design': {
    positive: ['System design interview prep', 'Event sourcing and CQRS', 'Scaling microservices'],
    negative: ['Design systems in Figma', 'System update notes'],
  },
  databases: {
    positive: ['Postgres 18 and the query planner', 'SQLite in production', 'Redis versus Valkey'],
    negative: ['Index of all posts', 'Stock market index hits a record'],
  },
  devops: {
    positive: ['Kubernetes pitfalls', 'Docker layer caching', 'Terraform at scale'],
    negative: ['Deployment of a rocket', 'Incidental findings'],
  },
  security: {
    positive: ['XSS in the wild', 'CVE-2026-1234 analysis', 'Supply chain attacks on npm'],
    negative: ['Authentic cooking', 'Authors on writing'],
  },
  performance: {
    positive: ['Core Web Vitals tips', 'Benchmark results for parsers', 'Our build is 10x faster'],
    negative: ['Faster horses', 'Fast food nation'],
  },
  css: {
    positive: ['Tailwind v5 released', 'A guide to container queries', 'Flexbox cheatsheet'],
    negative: ['Cascading choices', 'Power grid failures'],
  },
  rust: {
    positive: ['Rust 2027 edition', 'Tokio internals', 'Cargo workflows'],
    negative: ['Rust belt economies', 'Trusty tools'],
  },
  go: {
    positive: ['Go 1.24 released', 'Golang generics in practice', 'Spawning a goroutine safely'],
    negative: ["Let's go build it", 'Go to market strategy', 'Let it go'],
  },
  python: {
    positive: ['Python 3.14 released', 'FastAPI patterns', 'uv replaces pip'],
    negative: ['Pythonic thinking', 'Pipeline failures'],
  },
  testing: {
    positive: ['Vitest 5 released', 'Playwright tips', 'TDD in practice'],
    negative: ['Contest results', 'Tested on three devices'],
  },
  'web-platform': {
    positive: ['Chrome 140 ships', 'Web components in 2026', 'HTML is enough'],
    negative: ['Chromatic scales', 'Browsing habits'],
  },
  mobile: {
    positive: ['iOS 27 beta', 'Kotlin multiplatform', 'Flutter 4 released'],
    negative: ['Radios and antennas', 'Androids in fiction'],
  },
  career: {
    positive: [
      'Salary negotiation tips',
      'Layoffs and burnout',
      'From staff engineer to promotion',
    ],
    negative: ['Carefree summer', 'Careful with that axe'],
  },
} satisfies Record<TagSlug, { positive: string[]; negative: string[] }>;

describe('taxonomy', () => {
  it('is version 1', () => {
    expect(TAXONOMY_VERSION).toBe(1);
  });

  it('defines the 18 tags of TAG_SLUGS in the same order', () => {
    expect(TAXONOMY.map((definition) => definition.slug)).toEqual([...TAG_SLUGS]);
    expect(TAG_SLUGS).toHaveLength(18);
  });

  it('has a label for every tag', () => {
    for (const definition of TAXONOMY) expect(definition.label).not.toBe('');
  });
});

describe.each(TAG_SLUGS)('tag %s', (slug) => {
  const { positive, negative } = CASES[slug];

  it.each(positive)('tags "%s"', (title) => {
    expect(tagTitle(title)).toContain(slug);
  });

  it.each(negative)('does not tag "%s"', (title) => {
    expect(tagTitle(title)).not.toContain(slug);
  });
});

describe('Appendix A cases', () => {
  it.each([
    ['React to criticism', []],
    ['Go 1.24 released', ['go']],
    ["Let's go build it", []],
    ['AI agents in production', ['ai-llms']],
  ] as const)('"%s"', (title, expected) => {
    expect(tagTitle(title)).toEqual(expected);
  });
});

describe('tagStory', () => {
  const tagWith = (input: {
    title?: string;
    url?: string;
    sourceTags?: string[];
    categories?: string[];
  }) =>
    tagStory({
      title: 'Untitled',
      url: 'https://example.com/post',
      sourceTags: [],
      categories: [],
      ...input,
    });

  it('ts counts only as a source tag or category', () => {
    expect(tagWith({ title: 'Why ts matters' })).toEqual([]);
    expect(tagWith({ sourceTags: ['ts'] })).toEqual(['typescript']);
    expect(tagWith({ categories: ['TS'] })).toEqual(['typescript']);
  });

  it('plain go matches only as a source tag', () => {
    expect(tagWith({ title: 'Why we go serverless' })).toEqual([]);
    expect(tagWith({ sourceTags: ['go'] })).toEqual(['go']);
  });

  it('Go 1. is case-sensitive', () => {
    expect(tagWith({ title: 'what is new in go 1.24' })).toEqual([]);
    expect(tagWith({ title: 'What is new in Go 1.24' })).toEqual(['go']);
  });

  it('AI is case-sensitive but ai as a source tag matches', () => {
    expect(tagWith({ title: 'Why ai hype fades' })).toEqual([]);
    expect(tagWith({ title: 'Why AI hype fades' })).toEqual(['ai-llms']);
    expect(tagWith({ sourceTags: ['ai'] })).toEqual(['ai-llms']);
  });

  it('React is case-sensitive but the react source tag matches', () => {
    expect(tagWith({ title: 'How to react under pressure' })).toEqual([]);
    expect(tagWith({ sourceTags: ['react'] })).toEqual(['react']);
  });

  it('agent needs ai or llm in the text, or a source tag', () => {
    expect(tagWith({ title: 'Booking agent tips' })).toEqual([]);
    expect(tagWith({ title: 'Building an agent with an LLM' })).toEqual(['ai-llms']);
    expect(tagWith({ title: 'Agents need ai guardrails' })).toEqual(['ai-llms']);
    expect(tagWith({ title: 'Booking agent tips', sourceTags: ['agents'] })).toEqual(['ai-llms']);
  });

  it('index needs sql or database in the text', () => {
    expect(tagWith({ title: 'Index funds explained' })).toEqual([]);
    expect(tagWith({ title: 'Choosing an index for SQL joins' })).toEqual(['databases']);
    expect(tagWith({ title: 'Index design for your database' })).toEqual(['databases']);
  });

  it('auth matches only as a whole word', () => {
    expect(tagWith({ title: 'Auth in 2026' })).toEqual(['security']);
    expect(tagWith({ title: 'Authentication, authorization, authoring' })).toEqual([]);
  });

  it.each([
    ['10x faster', true],
    ['10× faster', true],
    ['Top 10 faster cars', false],
    ['30% faster', true],
    ['2 times faster', true],
    ['2.5x faster', true],
    ['Making builds faster', false],
    ['10 ways to go faster', false],
  ])('faster needs a number: "%s"', (title, expected) => {
    expect(tagWith({ title }).includes('performance')).toBe(expected);
  });

  it('react native maps to both react and mobile', () => {
    expect(tagWith({ title: 'Shipping with React Native' })).toEqual(['react', 'mobile']);
  });

  it('exclude phrases veto their tag', () => {
    expect(tagWith({ title: 'React to criticism', sourceTags: ['react'] })).toEqual([]);
    expect(tagWith({ title: 'The Rust Belt revival', sourceTags: ['rust'] })).toEqual([]);
    expect(tagWith({ title: 'Reacting to Vue' })).toEqual(['vue']);
  });

  it('matches Dev.to tags written without separators', () => {
    expect(tagWith({ sourceTags: ['reactnative'] })).toEqual(['react', 'mobile']);
    expect(tagWith({ sourceTags: ['machinelearning'] })).toEqual(['ai-llms']);
    expect(tagWith({ sourceTags: ['githubactions'] })).toEqual(['devops']);
    expect(tagWith({ categories: ['react-native'] })).toEqual(['react', 'mobile']);
  });

  it('matches phrases joined by hyphens in titles and URL slugs', () => {
    expect(tagWith({ title: 'Rust-belt towns rebound' })).toEqual([]);
    expect(tagWith({ title: 'The economy', url: 'https://example.com/rust-belt-revival' })).toEqual(
      [],
    );
    expect(tagWith({ title: 'A primer', url: 'https://example.com/system-design-primer' })).toEqual(
      ['system-design'],
    );
    expect(tagWith({ title: 'Tips', url: 'https://example.com/react-native-tips' })).toEqual([
      'react',
      'mobile',
    ]);
  });

  it('matches an alias next to a slash', () => {
    expect(tagWith({ title: 'React/Vue comparison' })).toEqual(['react', 'vue']);
    expect(tagWith({ title: 'Postgres/MySQL tips' })).toEqual(['databases']);
  });

  it('treats . as a word character inside tokens', () => {
    expect(tagWith({ title: 'Learn Node.js today' })).toEqual(['javascript']);
    expect(tagWith({ title: 'CI/CD pipelines' })).toEqual(['devops']);
    expect(tagWith({ title: 'Just use js. It works' })).toEqual(['javascript']);
    expect(tagWith({ title: 'Read the foo.js docs' })).toEqual([]);
  });

  it('reads the URL host and path as tokens', () => {
    expect(tagWith({ title: 'A guide', url: 'https://react.dev/blog/2026' })).toEqual(['react']);
    expect(tagWith({ title: 'A guide', url: 'https://www.go.dev/doc' })).toEqual(['go']);
    expect(tagWith({ title: 'A guide', url: 'https://example.com/why-we-chose-rust' })).toEqual([
      'rust',
    ]);
    expect(tagWith({ title: 'A guide', url: 'https://crates.io/crates/serde' })).toEqual(['rust']);
  });

  it('survives an unparseable url', () => {
    expect(tagWith({ title: 'Docker tips', url: 'not a url' })).toEqual(['devops']);
  });

  it('matches source tags and categories after slug-normalisation', () => {
    expect(tagWith({ sourceTags: ['TypeScript'] })).toEqual(['typescript']);
    expect(tagWith({ sourceTags: ['Node.js'] })).toEqual(['javascript']);
    expect(tagWith({ categories: ['Machine Learning'] })).toEqual(['ai-llms']);
    expect(tagWith({ sourceTags: ['webdev', 'beginners'] })).toEqual([]);
  });

  it('deduplicates a tag found by several rules', () => {
    expect(tagWith({ title: 'React and reactjs', sourceTags: ['react', 'reactjs'] })).toEqual([
      'react',
    ]);
  });

  it('returns tags in taxonomy order, not match order', () => {
    expect(
      tagWith({ title: 'Salary at a Rust shop, with Vue on the front', sourceTags: ['css'] }),
    ).toEqual(['vue', 'css', 'rust', 'career']);
  });

  it('caps the result at 5 tags', () => {
    const tags = tagWith({
      title: 'React Vue TypeScript Rust Python Docker Postgres salary',
    });
    expect(tags).toEqual(['react', 'vue', 'typescript', 'databases', 'devops']);
  });
});
