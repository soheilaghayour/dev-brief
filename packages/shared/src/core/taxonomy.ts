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
    label: 'React',
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
    label: 'Vue',
    aliases: ['vue', 'vuejs', 'vue.js', 'nuxt', 'pinia', 'vite plugin vue'],
  },
  typescript: {
    label: 'TypeScript',
    aliases: ['typescript', 'tsc', 'tsconfig', 'deno', 'type-level', 'zod'],
    sourceTagOnlyAliases: ['ts'],
  },
  javascript: {
    label: 'JavaScript',
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
    label: 'AI/LLMs',
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
    label: 'System Design',
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
    label: 'Databases',
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
    label: 'DevOps',
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
    label: 'Security',
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
    label: 'Performance',
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
    label: 'CSS',
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
    label: 'Rust',
    aliases: ['rust', 'rustlang', 'cargo', 'crates.io', 'tokio', 'wasm-bindgen'],
    exclude: ['rust belt'],
  },
  go: {
    label: 'Go',
    aliases: ['golang', 'go.dev', 'goroutine', 'goroutines'],
    caseSensitiveAliases: ['Go 1.'],
    sourceTagOnlyAliases: ['go'],
  },
  python: {
    label: 'Python',
    aliases: ['python', 'pypi', 'django', 'flask', 'fastapi', 'pandas', 'uv', 'pip'],
  },
  testing: {
    label: 'Testing',
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
    label: 'Web Platform',
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
    label: 'Mobile',
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
    label: 'Career',
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
} satisfies Record<TagSlug, Omit<TagDefinition, 'slug'>>;

export const TAXONOMY: readonly TagDefinition[] = TAG_SLUGS.map((slug) => ({
  slug,
  ...TAG_DEFINITIONS[slug],
}));
