export const TAXONOMY_VERSION = 1;

export const TAG_SLUGS = [
  'react',
  'vue',
  'typescript',
  'javascript',
  'ai-llms',
  'system-design',
  'databases',
  'devops',
  'security',
  'performance',
  'css',
  'rust',
  'go',
  'python',
  'testing',
  'web-platform',
  'mobile',
  'career',
] as const;

export type TagSlug = (typeof TAG_SLUGS)[number];

const TAG_SLUG_SET: ReadonlySet<string> = /* @__PURE__ */ new Set(TAG_SLUGS);

/** Whether a stored tag is in the current taxonomy; a slug retired by a version bump is not. */
export const isTagSlug = (tag: string): tag is TagSlug => TAG_SLUG_SET.has(tag);

/** Display name per tag; the web ships only these, not the matching rules in `TAXONOMY`. */
export const TAG_LABELS = {
  react: 'React',
  vue: 'Vue',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  'ai-llms': 'AI/LLMs',
  'system-design': 'System Design',
  databases: 'Databases',
  devops: 'DevOps',
  security: 'Security',
  performance: 'Performance',
  css: 'CSS',
  rust: 'Rust',
  go: 'Go',
  python: 'Python',
  testing: 'Testing',
  'web-platform': 'Web Platform',
  mobile: 'Mobile',
  career: 'Career',
} satisfies Record<TagSlug, string>;

export interface TagDefinition {
  slug: TagSlug;
  label: string;
  /** Lowercase words or phrases matched in the lowercased title and URL tokens, and by slug in source tags. */
  aliases: readonly string[];
  /** Matched against the original-case title only. */
  caseSensitiveAliases?: readonly string[];
  /** Match only as a source tag or category, never in text. */
  sourceTagOnlyAliases?: readonly string[];
  /** Match in text only when one of `requiresAny` is also in the text. */
  conditionalAliases?: readonly { alias: string; requiresAny: readonly string[] }[];
  /** Regex sources tested against the lowercased text, for rules a word list can't express. */
  patterns?: readonly string[];
  /** Phrases that veto the tag when present in the text. */
  exclude?: readonly string[];
}

const TAG_DEFINITIONS = {
  react: {
    aliases: [
      'reactjs',
      'react.js',
      'react.dev',
      'next.js',
      'nextjs',
      'react native',
      'react server components',
      'rsc',
      'jsx',
      'remix',
      'react router',
    ],
    caseSensitiveAliases: ['React'],
    exclude: ['react to', 'reacting'],
  },
  vue: {
    aliases: ['vue', 'vuejs', 'vue.js', 'nuxt', 'pinia', 'vite plugin vue'],
  },
  typescript: {
    aliases: ['typescript', 'tsc', 'tsconfig', 'deno', 'type-level', 'zod'],
    sourceTagOnlyAliases: ['ts'],
  },
  javascript: {
    aliases: [
      'javascript',
      'js',
      'ecmascript',
      'es2026',
      'node.js',
      'nodejs',
      'bun',
      'npm',
      'esm',
      'v8',
    ],
  },
  'ai-llms': {
    aliases: [
      'llm',
      'llms',
      'gpt',
      'claude',
      'gemini',
      'openai',
      'anthropic',
      'mistral',
      'rag',
      'mcp',
      'prompt',
      'inference',
      'fine-tuning',
      'machine learning',
      'ml',
    ],
    caseSensitiveAliases: ['AI'],
    sourceTagOnlyAliases: ['agent', 'agents'],
    conditionalAliases: [
      { alias: 'agent', requiresAny: ['ai', 'llm', 'llms'] },
      { alias: 'agents', requiresAny: ['ai', 'llm', 'llms'] },
    ],
  },
  'system-design': {
    aliases: [
      'system design',
      'architecture',
      'distributed systems',
      'microservices',
      'event sourcing',
      'cqrs',
      'scalability',
      'consensus',
      'raft',
      'load balancing',
      'caching strategy',
    ],
  },
  databases: {
    aliases: [
      'postgres',
      'postgresql',
      'mysql',
      'sqlite',
      'mongodb',
      'redis',
      'database',
      'sql',
      'orm',
      'prisma',
      'drizzle',
      'clickhouse',
      'duckdb',
      'query planner',
    ],
    conditionalAliases: [{ alias: 'index', requiresAny: ['sql', 'database'] }],
  },
  devops: {
    aliases: [
      'devops',
      'kubernetes',
      'k8s',
      'docker',
      'terraform',
      'ci/cd',
      'github actions',
      'observability',
      'opentelemetry',
      'sre',
      'incident',
      'deploy',
    ],
  },
  security: {
    aliases: [
      'security',
      'vulnerability',
      'cve',
      'xss',
      'csrf',
      'auth',
      'oauth',
      'supply chain',
      'exploit',
      'encryption',
      'zero-day',
    ],
  },
  performance: {
    aliases: [
      'performance',
      'latency',
      'benchmark',
      'optimization',
      'profiling',
      'core web vitals',
      'lcp',
      'memory leak',
      'throughput',
    ],
    // "faster" counts only after a number: "10x faster", "30% faster", "2 times faster".
    patterns: ['(?<![\\w.])\\d+(?:\\.\\d+)?\\s*(?:x|×|%|times)\\s+faster\\b'],
  },
  css: {
    aliases: [
      'css',
      'tailwind',
      'flexbox',
      'grid layout',
      'container queries',
      'sass',
      'design tokens',
      'view transitions',
    ],
  },
  rust: {
    aliases: ['rust', 'rustlang', 'cargo', 'crates.io', 'tokio', 'wasm-bindgen'],
    exclude: ['rust belt'],
  },
  go: {
    aliases: ['golang', 'go.dev', 'goroutine', 'goroutines'],
    caseSensitiveAliases: ['Go 1.'],
    sourceTagOnlyAliases: ['go'],
  },
  python: {
    aliases: ['python', 'pypi', 'django', 'flask', 'fastapi', 'pandas', 'uv', 'pip'],
  },
  testing: {
    aliases: [
      'testing',
      'unit test',
      'e2e',
      'playwright',
      'vitest',
      'jest',
      'cypress',
      'tdd',
      'test coverage',
    ],
  },
  'web-platform': {
    aliases: [
      'web platform',
      'browser',
      'chrome',
      'firefox',
      'safari',
      'webkit',
      'w3c',
      'whatwg',
      'web components',
      'html',
      'pwa',
      'webassembly',
      'wasm',
    ],
  },
  mobile: {
    aliases: [
      'ios',
      'android',
      'swift',
      'kotlin',
      'flutter',
      'react native',
      'swiftui',
      'jetpack compose',
    ],
  },
  career: {
    aliases: [
      'career',
      'interview',
      'hiring',
      'layoffs',
      'salary',
      'burnout',
      'engineering manager',
      'staff engineer',
      'promotion',
      'remote work',
    ],
  },
} satisfies Record<TagSlug, Omit<TagDefinition, 'slug' | 'label'>>;

export const TAXONOMY: readonly TagDefinition[] = /* @__PURE__ */ TAG_SLUGS.map((slug) => ({
  slug,
  label: TAG_LABELS[slug],
  ...TAG_DEFINITIONS[slug],
}));
