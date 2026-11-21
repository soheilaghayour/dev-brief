// PRD F2.1: the pure half of the clustering step; the model call and the database live in the API.

/** A candidate needs `candidateScore` of at least this; it decides only whether a model call is worth making. Tuned for recall on the fixture and the held-out pairs, within the cluster cap. */
export const CLUSTER_CANDIDATE_MIN_SCORE = 0.16;
/** The model's confidence at which a match joins a cluster; tuned on the fixture for precision. */
export const CLUSTER_MIN_CONFIDENCE = 0.8;
export const CLUSTER_MAX_SIZE = 12;
export const CLUSTER_MAX_CANDIDATES = 5;
export const CLUSTER_SIGNAL_WEIGHTS = { trgm: 0.45, ent: 0.45, link: 0.1 } as const;

// Capitalised words that start or fill a headline without naming anything.
const STOPLIST = new Set(
  (
    'a an the and or but for of to in on at by with from into over under about after before ' +
    'how why what when where which who is are was were be been new now just here this that these those ' +
    'show ask hn tell launch hiring introducing announcing announces announced announce released releases ' +
    'release releasing available update updates updated version versions guide tutorial using use used ' +
    'getting get got we our you your i my it its they their one two three four five six seven eight nine ten ' +
    'part notes note first last best top vs via not no yes all any more most less why ' +
    // "AI" is in about a quarter of tech headlines, so sharing it says nothing.
    'ai ' +
    'january february march april may june july august september october november december ' +
    'monday tuesday wednesday thursday friday saturday sunday'
  ).split(' '),
);

// Hosts that carry many unrelated projects, so sharing one says nothing.
const GENERIC_HOSTS = [
  'github.com',
  'gitlab.com',
  'news.ycombinator.com',
  'dev.to',
  'medium.com',
  'substack.com',
  'youtube.com',
  'youtu.be',
  'twitter.com',
  'x.com',
  'reddit.com',
  'wordpress.com',
  'blogspot.com',
  'hashnode.dev',
  'npmjs.com',
  'pypi.org',
  'crates.io',
  'arxiv.org',
];

// C++, C# and F# would lose their symbol to the trailing-punctuation trim.
const SYMBOL_LANGUAGE = /^(?:c\+\+|[cf]#)$/i;

const VERSION = /^v?(\d+(?:\.\d+)+)$/i;

function parseUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function hostOf(url: URL) {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

function isGenericHost(host: string) {
  return GENERIC_HOSTS.some((generic) => host === generic || host.endsWith(`.${generic}`));
}

function pathSegments(url: URL) {
  return url.pathname.split('/').filter(Boolean);
}

// Hosted-project URLs carry their name in the path: github.com/owner/repo.
function repoSlugOf(url: string) {
  const parsed = parseUrl(url);
  return parsed ? repoSlug(parsed) : null;
}

function repoSlug(url: URL) {
  if (hostOf(url) !== 'github.com') return null;
  const [owner, repo] = pathSegments(url);
  return owner && repo ? `${owner}/${repo}`.toLowerCase() : null;
}

function isProductLike(word: string) {
  return (
    // camelCase or PascalCase inside the word (TypeScript, iOS, pnpm is not), or an acronym.
    /[a-z][A-Z]/.test(word) ||
    /^[A-Z]{2,}[a-z0-9]*$/.test(word) ||
    // Letters mixed with digits (k8s, GPT-5, Vue3) or a runtime-style suffix (Node.js).
    (/[a-z]/i.test(word) && /\d/.test(word)) ||
    /\.(?:js|ts|io|rs|py|net)$/i.test(word)
  );
}

// A patch version also counts as its release line, qualified by the name before it so "Firefox 150" never meets "Chrome 150".
function addVersion(tokens: Set<string>, version: string, name: string | null) {
  const line = version.split('.').slice(0, 2).join('.');
  tokens.add(version);
  tokens.add(line);
  if (name) tokens.add(`${name}@${line}`);
}

/** Capitalised or product-like title words, version strings, the repo slug and nothing from the host, lowercased. */
export function entityTokens(title: string, url: string): Set<string> {
  const tokens = new Set<string>();
  const words = title.normalize('NFKC').match(/[\p{L}\p{N}][\p{L}\p{N}.+#_-]*/gu) ?? [];
  let lastName: string | null = null;
  for (const raw of words) {
    const symbolLanguage = SYMBOL_LANGUAGE.test(raw);
    const word = symbolLanguage ? raw : raw.replace(/[.\-+_#]+$/, '');
    const version = VERSION.exec(word);
    if (version?.[1]) {
      addVersion(tokens, version[1], lastName);
      lastName = null;
      continue;
    }
    // "SQLite 4" and "SQLite 4.0" name the same version.
    if (/^\d{1,3}$/.test(word)) {
      if (lastName) tokens.add(`${lastName}@${word}.0`);
      lastName = null;
      continue;
    }
    const lower = word.toLowerCase();
    lastName = null;
    if (lower.length < 2 || STOPLIST.has(lower)) continue;
    if (symbolLanguage || /^\p{Lu}/u.test(word) || isProductLike(word)) {
      tokens.add(lower);
      lastName = lower;
    }
  }
  const slug = repoSlugOf(url);
  if (slug) tokens.add(slug);
  return tokens;
}

/** Share of distinct members the two sets hold in common (the formula of `pg_trgm`'s `similarity()` on trigrams); 0 when both are empty. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (a.size === 0 && b.size === 0) return 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const token of smaller) if (larger.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Whether two URLs name the same project: one GitHub repo, or one host whose shorter non-root path prefixes the other and whose query matches when the paths are equal. */
export function sameLink(urlA: string, urlB: string) {
  const a = parseUrl(urlA);
  const b = parseUrl(urlB);
  if (!a || !b || hostOf(a) !== hostOf(b)) return false;
  const slugA = repoSlug(a);
  if (slugA !== null || repoSlug(b) !== null) return slugA === repoSlug(b);
  if (isGenericHost(hostOf(a))) return false;
  const [shorter, longer] = [pathSegments(a), pathSegments(b)].sort((x, y) => x.length - y.length);
  if (!shorter || !longer || shorter.length === 0) return false;
  if (!shorter.every((segment, index) => segment === longer[index])) return false;
  // Equal paths with different queries are different pages (`/watch?v=a`, `/watch?v=b`).
  return shorter.length < longer.length || a.search === b.search;
}

/** The lowercase trigrams `pg_trgm` extracts: each alphanumeric word padded with two spaces before and one after. */
export function trigramsOf(normalizedTitle: string) {
  const trigrams = new Set<string>();
  for (const word of normalizedTitle.match(/[\p{L}\p{N}]+/gu) ?? []) {
    const padded = [...`  ${word} `];
    for (let start = 0; start + 3 <= padded.length; start += 1) {
      trigrams.add(padded.slice(start, start + 3).join(''));
    }
  }
  return trigrams;
}

// `\b` treats `_` as a word character, which would hide `_cve-…` in a URL slug; headlines also carry Unicode hyphens.
const UNICODE_HYPHENS = /[\u2010\u2011\u2013\u2014]/g;
const HYPHEN = '[-\\u2010\\u2011\\u2013\\u2014]';
const ADVISORY_ID = new RegExp(
  `(?<![a-z0-9])(?:cve${HYPHEN}\\d{4}${HYPHEN}\\d{4,}|ghsa(?:${HYPHEN}[a-z0-9]{4}){3})(?![a-z0-9])`,
  'gi',
);

/** The CVE and GHSA ids a story names in its title, excerpt or URL, lowercased. */
export function advisoryIds(story: { title: string; url: string; excerpt: string | null }) {
  const text = `${story.title} ${story.excerpt ?? ''} ${story.url}`;
  return new Set(
    Array.from(text.matchAll(ADVISORY_ID), ([id]) =>
      id.toLowerCase().replace(UNICODE_HYPHENS, '-'),
    ),
  );
}

/** What scoring a story against another needs, computed once per story. */
export type ClusterProfile = {
  entities: ReadonlySet<string>;
  trigrams: ReadonlySet<string>;
  advisories: ReadonlySet<string>;
};

/** The entity tokens, title trigrams and advisory ids of a story. */
export function clusterProfile(story: {
  title: string;
  url: string;
  excerpt: string | null;
  normalizedTitle: string;
}) {
  return {
    entities: entityTokens(story.title, story.url),
    trigrams: trigramsOf(story.normalizedTitle),
    advisories: advisoryIds(story),
  } satisfies ClusterProfile;
}

function sharesAny(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  for (const member of a) if (b.has(member)) return true;
  return false;
}

/** F2.1's `link` signal: the two stories point at the same project or name the same advisory. */
function sameSubject(story: ClusterStoryInput, row: ClusterStoryInput) {
  return (
    sharesAny(story.profile.advisories, row.profile.advisories) || sameLink(story.url, row.url)
  );
}

export type ClusterStoryInput = {
  id: string;
  title: string;
  url: string;
  publishedAt: Date;
  profile: ClusterProfile;
};

/** A story in the ±72 h window, with the cluster it stands in. */
export type ClusterPoolRow = ClusterStoryInput & {
  clusterId: string | null;
  /** `Cluster.memberCount` of `clusterId`; null for a single story. */
  clusterMemberCount: number | null;
};

export type ClusterCandidate<Row extends ClusterPoolRow = ClusterPoolRow> = Row & {
  candidateScore: number;
};

function byScoreThenNewerThenId(a: ClusterCandidate, b: ClusterCandidate) {
  return (
    b.candidateScore - a.candidateScore ||
    b.publishedAt.getTime() - a.publishedAt.getTime() ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

/** F2.1 rule 1: scores the pool, offers each cluster once through its best member, and returns at most 5 above the floor. */
export function rankClusterCandidates<Row extends ClusterPoolRow>(
  story: ClusterStoryInput,
  pool: readonly Row[],
): ClusterCandidate<Row>[] {
  const best = new Map<string, ClusterCandidate<Row>>();
  for (const row of pool) {
    if (row.id === story.id) continue;
    if (row.clusterId !== null && (row.clusterMemberCount ?? 0) >= CLUSTER_MAX_SIZE) continue;
    const titleScore =
      CLUSTER_SIGNAL_WEIGHTS.trgm * jaccard(story.profile.trigrams, row.profile.trigrams) +
      CLUSTER_SIGNAL_WEIGHTS.ent * jaccard(story.profile.entities, row.profile.entities);
    // Parsing URLs is the costly signal, so it runs only when it could lift the row over the floor.
    if (titleScore + CLUSTER_SIGNAL_WEIGHTS.link < CLUSTER_CANDIDATE_MIN_SCORE) continue;
    const candidateScore =
      titleScore + CLUSTER_SIGNAL_WEIGHTS.link * (sameSubject(story, row) ? 1 : 0);
    if (candidateScore < CLUSTER_CANDIDATE_MIN_SCORE) continue;
    const candidate = { ...row, candidateScore };
    const key = row.clusterId ?? `story:${row.id}`;
    const current = best.get(key);
    if (!current || byScoreThenNewerThenId(candidate, current) < 0) best.set(key, candidate);
  }
  return [...best.values()].sort(byScoreThenNewerThenId).slice(0, CLUSTER_MAX_CANDIDATES);
}

export type ClusterDecision<Target> =
  { kind: 'join'; target: Target; clusterScore: number } | { kind: 'single'; clusterScore: number };

/** F2.1 rule 2: S joins the labelled candidate the model matched when its confidence reaches `CLUSTER_MIN_CONFIDENCE`, and `clusterScore` is that confidence, or 0 for `none`. */
export function clusterDecision<Target>(
  reply: { match: string; confidence: number },
  labelled: readonly { label: string; target: Target }[],
): ClusterDecision<Target> {
  const matched =
    reply.match === 'none' ? undefined : labelled.find((c) => c.label === reply.match);
  // A label that was never sent is the same as no match.
  if (!matched) return { kind: 'single', clusterScore: 0 };
  if (reply.confidence < CLUSTER_MIN_CONFIDENCE) {
    return { kind: 'single', clusterScore: reply.confidence };
  }
  return { kind: 'join', target: matched.target, clusterScore: reply.confidence };
}
