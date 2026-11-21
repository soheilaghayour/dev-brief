import { describe, expect, it } from 'vitest';
import {
  CLUSTER_CANDIDATE_MIN_SCORE,
  CLUSTER_MAX_CANDIDATES,
  CLUSTER_MAX_SIZE,
  CLUSTER_MIN_CONFIDENCE,
  CLUSTER_SIGNAL_WEIGHTS,
  type ClusterPoolRow,
  advisoryIds,
  clusterDecision,
  clusterProfile,
  entityTokens,
  jaccard,
  rankClusterCandidates,
  sameLink,
  trigramsOf,
} from './clustering.js';

describe('constants', () => {
  it('match F2.1', () => {
    expect([
      CLUSTER_CANDIDATE_MIN_SCORE,
      CLUSTER_MIN_CONFIDENCE,
      CLUSTER_MAX_SIZE,
      CLUSTER_MAX_CANDIDATES,
      CLUSTER_SIGNAL_WEIGHTS,
    ]).toEqual([0.16, 0.8, 12, 5, { trgm: 0.45, ent: 0.45, link: 0.1 }]);
  });
});

describe('entityTokens', () => {
  it('keeps capitalised and product-like words, versions, the repo slug and a project domain', () => {
    const tokens = entityTokens(
      'Show HN: TypeScript v5.2 and Node.js 22.1 ship with k8s support',
      'https://github.com/Microsoft/TypeScript/releases/tag/v5.2',
    );
    expect(tokens).toEqual(
      new Set([
        'typescript',
        '5.2',
        'typescript@5.2',
        'node.js',
        '22.1',
        'node.js@22.1',
        'k8s',
        'microsoft/typescript',
      ]),
    );
  });

  it('counts a patch version as its release line, and a bare number after a name as that major version', () => {
    expect(entityTokens('Node.js v26.5.0 (Current)', 'https://nodejs.org/x')).toContain('26.5');
    const bare = entityTokens('SQLite 4 is here', 'https://dev.to/x');
    const dotted = entityTokens('SQLite 4.0 announced', 'https://dev.to/y');
    expect([...bare].filter((token) => dotted.has(token))).toContain('sqlite@4.0');
  });

  it('does not match a bare number shared by different names', () => {
    const firefox = entityTokens('Firefox 150 is out', 'https://dev.to/a');
    const chrome = entityTokens('Chrome 150 is out', 'https://dev.to/b');
    expect([...firefox].filter((token) => chrome.has(token))).toEqual([]);
    const chapter = entityTokens('Chapter 3 of the book', 'https://dev.to/c');
    expect(chapter).not.toContain('3.0');
  });

  it('keeps C++, C# and F# as tokens', () => {
    expect(entityTokens('Why C++ and C# beat F# here', 'https://dev.to/a')).toEqual(
      new Set(['c++', 'c#', 'f#']),
    );
  });

  it('drops the stoplist and plain lowercase words, and ignores hosting domains', () => {
    const tokens = entityTokens('How we made the build faster', 'https://news.ycombinator.com/x');
    expect(tokens.size).toBe(0);
  });

  it('drops AI, which names nothing in a tech headline', () => {
    const job = entityTokens("AI isn't replacing your job", 'https://example.com/a');
    const agents = entityTokens(
      'AI agents ask better questions than KPMG',
      'https://example.com/b',
    );
    expect([...job].filter((token) => agents.has(token))).toEqual([]);
  });

  it('takes nothing from the host, so two posts of one blog share no token for it', () => {
    expect(entityTokens('Bun is fast', 'https://www.bun.sh/blog/bun-v1.2')).toEqual(
      new Set(['bun']),
    );
  });
});

describe('advisoryIds', () => {
  it('reads CVE and GHSA ids from the title, the excerpt and the URL, whatever the case', () => {
    expect(
      advisoryIds({
        title: 'Two New React 19 Vulnerabilities',
        url: 'https://vercel.com/kb/bulletin/security-bulletin-cve-2025-55184-and-cve-2025-55183',
        excerpt: 'See GHSA-9qr9-h5gf-34mp and CVE-2025-55182/CVE-2025-66478.',
      }),
    ).toEqual(
      new Set([
        'cve-2025-55184',
        'cve-2025-55183',
        'ghsa-9qr9-h5gf-34mp',
        'cve-2025-55182',
        'cve-2025-66478',
      ]),
    );
  });

  it('reads an id after an underscore or a slash, and reads Unicode hyphens as hyphens', () => {
    expect(
      advisoryIds({
        title: 'CVE\u20112025\u201155182 and GHSA\u2013abcd\u2014efgh-ijkl',
        url: 'https://example.com/advisories/_cve-2025-66478',
        excerpt: null,
      }),
    ).toEqual(new Set(['cve-2025-55182', 'ghsa-abcd-efgh-ijkl', 'cve-2025-66478']));
  });

  it('reads no id glued to a longer word or number', () => {
    expect(
      advisoryIds({
        title: 'xcve-2025-55182 and 9ghsa-abcd-efgh-ijkl and cve-2025-551823x',
        url: 'https://example.com',
        excerpt: null,
      }),
    ).toEqual(new Set());
  });

  it('reads no id from a version, a year or a partial id', () => {
    expect(
      advisoryIds({
        title: 'Node.js 22.1 in 2026',
        url: 'https://example.com/cve-2026',
        excerpt: null,
      }),
    ).toEqual(new Set());
  });
});

describe('trigramsOf', () => {
  it('pads each word with two leading spaces and one trailing, as pg_trgm does', () => {
    expect(trigramsOf('cat')).toEqual(new Set(['  c', ' ca', 'cat', 'at ']));
    expect(trigramsOf('a b')).toEqual(new Set(['  a', ' a ', '  b', ' b ']));
  });
});

describe('sameLink', () => {
  it('is true for the same GitHub repo at any path, whatever the case', () => {
    expect(
      sameLink('https://github.com/Acme/Widget', 'https://github.com/acme/widget/releases'),
    ).toBe(true);
    expect(sameLink('https://github.com/acme/widget', 'https://github.com/acme/other')).toBe(false);
  });

  it('is true for the same host when one path is a segment prefix of the other', () => {
    expect(sameLink('https://example.com/blog', 'https://www.example.com/blog/post-1')).toBe(true);
    expect(sameLink('https://example.com/blog', 'https://example.com/blogger/post')).toBe(false);
  });

  it('is false when the shorter path is the root, the hosts differ, or a URL is invalid', () => {
    expect(sameLink('https://example.com/', 'https://example.com/a/b')).toBe(false);
    expect(sameLink('https://example.com/a', 'https://example.org/a')).toBe(false);
    expect(sameLink('not a url', 'https://example.com/a')).toBe(false);
  });

  it('applies only the repo rule on hosts that carry many projects, subdomains included', () => {
    expect(sameLink('https://dev.to/alice', 'https://dev.to/alice/post')).toBe(false);
    expect(sameLink('https://m.youtube.com/watch', 'https://m.youtube.com/watch/x')).toBe(false);
  });

  it('tells pages apart by query when the paths are equal', () => {
    expect(sameLink('https://example.com/watch?v=a', 'https://example.com/watch?v=b')).toBe(false);
    expect(sameLink('https://example.com/watch?v=a', 'https://example.com/watch?v=a')).toBe(true);
  });
});

const withProfile = <Fields extends { title: string; url: string; excerpt?: string | null }>(
  fields: Fields,
) => ({
  ...fields,
  profile: clusterProfile({
    excerpt: null,
    ...fields,
    normalizedTitle: fields.title.toLowerCase(),
  }),
});

const story = withProfile({
  id: 's',
  title: 'React 19.1 released',
  url: 'https://react.dev/blog/react-19-1',
  publishedAt: new Date('2026-11-10T12:00:00Z'),
});

function row(overrides: Partial<Omit<ClusterPoolRow, 'profile'>> & { id: string }) {
  return withProfile({
    title: 'React 19.1 released',
    url: 'https://react.dev/blog/react-19-1',
    publishedAt: new Date('2026-11-10T12:00:00Z'),
    clusterId: null,
    clusterMemberCount: null,
    ...overrides,
  });
}

describe('rankClusterCandidates', () => {
  it('scores 0.45 trigram + 0.45 entity + 0.10 link and drops candidates below the floor', () => {
    const [top, ...rest] = rankClusterCandidates(story, [
      row({ id: 'close', title: 'React 19.1 is out', url: 'https://react.dev/blog' }),
      row({ id: 'far', title: 'Cooking pasta', url: 'https://food.example/x' }),
    ]);
    expect(rest).toEqual([]);
    expect(top?.id).toBe('close');
    const trigrams = jaccard(story.profile.trigrams, top?.profile.trigrams ?? new Set());
    const entities = jaccard(story.profile.entities, top?.profile.entities ?? new Set());
    expect(top?.candidateScore).toBeCloseTo(0.45 * trigrams + 0.45 * entities + 0.1);
  });

  it('counts a shared CVE or GHSA id as link, which lifts a far-worded report over the floor', () => {
    const advisory = withProfile({
      id: 'advisory',
      title: 'Denial of Service and Source Code Exposure in React Server Components',
      url: 'https://react.dev/blog/2025/12/11/denial-of-service',
      excerpt: 'High vulnerability Denial of Service (CVE-2025-55184)',
      publishedAt: new Date('2025-12-11T00:00:00Z'),
    });
    const bulletin = (id: string, url: string) =>
      row({
        id,
        title: 'Two New React 19 Vulnerabilities',
        url,
        publishedAt: advisory.publishedAt,
      });
    const [same, other] = [
      bulletin('same', 'https://vercel.com/kb/bulletin/security-bulletin-cve-2025-55184'),
      bulletin('other', 'https://vercel.com/kb/bulletin/security-bulletin-cve-2025-11111'),
    ];
    const titleScore =
      0.45 * jaccard(advisory.profile.trigrams, same.profile.trigrams) +
      0.45 * jaccard(advisory.profile.entities, same.profile.entities);
    expect(titleScore).toBeLessThan(CLUSTER_CANDIDATE_MIN_SCORE);
    const result = rankClusterCandidates(advisory, [same, other]);
    expect(result.map(({ id }) => id)).toEqual(['same']);
    expect(result[0]?.candidateScore).toBeCloseTo(titleScore + 0.1);
  });

  it('offers each cluster once, through its best member', () => {
    const result = rankClusterCandidates(story, [
      row({ id: 'm1', clusterId: 'k', clusterMemberCount: 3, title: 'React 19.1 released today' }),
      row({ id: 'm2', clusterId: 'k', clusterMemberCount: 3 }),
      row({ id: 'single', title: 'React 19.1 release' }),
    ]);
    expect(result.map(({ id }) => id)).toEqual(['m2', 'single']);
  });

  it('AC-2.1.6 never offers a cluster that holds the maximum size', () => {
    const result = rankClusterCandidates(story, [
      row({ id: 'full', clusterId: 'k', clusterMemberCount: CLUSTER_MAX_SIZE }),
      row({ id: 'room', clusterId: 'j', clusterMemberCount: CLUSTER_MAX_SIZE - 1 }),
    ]);
    expect(result.map(({ id }) => id)).toEqual(['room']);
  });

  it('returns at most 5, ordered by score, then newer publishedAt, then id', () => {
    const older = new Date('2026-11-09T00:00:00Z');
    const pool = [
      row({ id: 'a', title: 'React 19.1 is out' }),
      row({ id: 'b', title: 'React 19.1 is out', publishedAt: older }),
      row({ id: 'c', title: 'React 19.1 is out' }),
      row({ id: 'top' }),
      row({ id: 'd', title: 'React 19.1 is out today' }),
      row({ id: 'e', title: 'React 19.1 is out today again' }),
      row({ id: 'f', title: 'React 19.1 is out today again and again' }),
    ];
    const result = rankClusterCandidates(story, pool);
    expect(result).toHaveLength(5);
    expect(result.map(({ id }) => id).slice(0, 4)).toEqual(['top', 'c', 'a', 'b']);
  });

  it('never offers the story itself', () => {
    expect(rankClusterCandidates(story, [row({ id: 's' })])).toEqual([]);
  });
});

describe('clusterDecision', () => {
  const labelled = [
    { label: 'c1', target: 'first' },
    { label: 'c2', target: 'second' },
  ];

  it('joins the matched candidate at or above the minimum confidence, storing the confidence', () => {
    expect(clusterDecision({ match: 'c2', confidence: 0.8 }, labelled)).toEqual({
      kind: 'join',
      target: 'second',
      clusterScore: 0.8,
    });
  });

  it('AC-2.1.3 stays single below the minimum confidence but keeps the confidence as the score', () => {
    expect(clusterDecision({ match: 'c1', confidence: 0.79 }, labelled)).toEqual({
      kind: 'single',
      clusterScore: 0.79,
    });
  });

  it('AC-2.1.3 scores none as 0, whatever its confidence', () => {
    expect(clusterDecision({ match: 'none', confidence: 0.95 }, labelled)).toEqual({
      kind: 'single',
      clusterScore: 0,
    });
  });

  it('treats a label that was not sent as none', () => {
    expect(clusterDecision({ match: 'c5', confidence: 0.99 }, labelled)).toEqual({
      kind: 'single',
      clusterScore: 0,
    });
  });
});
