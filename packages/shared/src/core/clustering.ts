// PRD F2.1: the pure half of the clustering step. Postgres supplies `trgm`; the model call lives in the API.

/** A candidate needs `candidateScore` of at least this; it decides only whether a model call is worth making. Tuned on the fixture for recall. */
export const CLUSTER_CANDIDATE_MIN_SCORE = 0.2;
/** The model's confidence at which a match joins a cluster; tuned on the fixture for precision. */
export const CLUSTER_MIN_CONFIDENCE = 0.8;
export const CLUSTER_MAX_SIZE = 12;
export const CLUSTER_MAX_CANDIDATES = 5;
export const CLUSTER_SIGNAL_WEIGHTS = { trgm: 0.55, ent: 0.35, link: 0.1 } as const;

// Capitalised words that start or fill a headline without naming anything.
const STOPLIST = new Set(
  (
    'a an the and or but for of to in on at by with from into over under about after before ' +
    'how why what when where which who is are was were be been new now just here this that these those ' +
    'show ask hn tell launch hiring introducing announcing announces announced announce released releases ' +
    'release releasing available update updates updated version versions guide tutorial using use used ' +
    'getting get got we our you your i my it its they their one two three four five six seven eight nine ten ' +
    'part notes note first last best top vs via not no yes all any more most less why ' +
    'january february march april may june july august september october november december ' +
    'monday tuesday wednesday thursday friday saturday sunday'
  ).split(' '),
);

// Hosts that carry many unrelated projects, so sharing one says nothing.
const GENERIC_HOSTS = new Set([
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
]);

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

function pathSegments(url: URL) {
  return url.pathname.split('/').filter(Boolean);
}

// Hosted-project URLs carry their name in the path: github.com/owner/repo.
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

// A patch version also counts as its release line: "26.5.0" and "26.5" are the same release in two headlines.
function addVersion(tokens: Set<string>, version: string) {
  tokens.add(version);
  tokens.add(version.split('.').slice(0, 2).join('.'));
}

/** Capitalised or product-like title words, version strings, the repo slug and a project domain, lowercased. */
export function entityTokens(title: string, url: string): Set<string> {
  const tokens = new Set<string>();
  const words = title.normalize('NFKC').match(/[\p{L}\p{N}][\p{L}\p{N}.+#_-]*/gu) ?? [];
  let afterName = false;
  for (const raw of words) {
    const word = raw.replace(/[.\-+_#]+$/, '');
    const version = VERSION.exec(word);
    if (version?.[1]) {
      addVersion(tokens, version[1]);
      afterName = false;
      continue;
    }
    // "SQLite 4" and "SQLite 4.0" name the same version.
    if (/^\d{1,3}$/.test(word)) {
      if (afterName) addVersion(tokens, `${word}.0`);
      afterName = false;
      continue;
    }
    const lower = word.toLowerCase();
    afterName = false;
    if (lower.length < 2 || STOPLIST.has(lower)) continue;
    const capitalised = /^\p{Lu}/u.test(word);
    if (capitalised || isProductLike(word)) {
      tokens.add(lower);
      afterName = true;
    }
  }
  const parsed = parseUrl(url);
  if (parsed) {
    const slug = repoSlug(parsed);
    if (slug) tokens.add(slug);
    const host = hostOf(parsed);
    if (!GENERIC_HOSTS.has(host) && host.includes('.')) tokens.add(host);
  }
  return tokens;
}

/** Share of distinct tokens the two sets hold in common; 0 when both are empty. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Whether two URLs point at the same project: the same GitHub repo (any path inside it), or the
 * same host (without `www.`) where one path is a segment-wise prefix of the other and the shorter
 * path isn't `/`. Hosts that carry many projects (github.com, dev.to, medium.com...) take the repo
 * rule only, since a shared host there says nothing.
 */
export function sameLink(urlA: string, urlB: string) {
  const a = parseUrl(urlA);
  const b = parseUrl(urlB);
  if (!a || !b || hostOf(a) !== hostOf(b)) return false;
  const slugA = repoSlug(a);
  if (slugA !== null || repoSlug(b) !== null) return slugA === repoSlug(b);
  if (GENERIC_HOSTS.has(hostOf(a))) return false;
  const [shorter, longer] = [pathSegments(a), pathSegments(b)].sort((x, y) => x.length - y.length);
  if (!shorter || !longer || shorter.length === 0) return false;
  return shorter.every((segment, index) => segment === longer[index]);
}

export type ClusterStoryInput = { id: string; title: string; url: string; publishedAt: Date };

/** A story in the ±72 h window, with the cluster it stands in and `trgm` from `similarity(normalizedTitle, ...)`. */
export type ClusterPoolRow = ClusterStoryInput & {
  clusterId: string | null;
  /** `Cluster.memberCount` of `clusterId`; null for a single story. */
  clusterMemberCount: number | null;
  trgm: number;
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
  const storyTokens = entityTokens(story.title, story.url);
  const best = new Map<string, ClusterCandidate<Row>>();
  for (const row of pool) {
    if (row.id === story.id) continue;
    if (row.clusterId !== null && (row.clusterMemberCount ?? 0) >= CLUSTER_MAX_SIZE) continue;
    const candidateScore =
      CLUSTER_SIGNAL_WEIGHTS.trgm * row.trgm +
      CLUSTER_SIGNAL_WEIGHTS.ent * jaccard(storyTokens, entityTokens(row.title, row.url)) +
      CLUSTER_SIGNAL_WEIGHTS.link * (sameLink(story.url, row.url) ? 1 : 0);
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

/**
 * F2.1 rule 2: S joins the labelled candidate the model matched when its confidence reaches
 * `CLUSTER_MIN_CONFIDENCE`. `clusterScore` is that confidence, or 0 for `none` (AC-2.1.3).
 */
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
