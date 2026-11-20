import { describe, expect, it } from 'vitest';
import {
  CLUSTER_CANDIDATE_MIN_SCORE,
  CLUSTER_MAX_CANDIDATES,
  CLUSTER_MAX_SIZE,
  CLUSTER_MIN_CONFIDENCE,
  CLUSTER_SIGNAL_WEIGHTS,
  type ClusterPoolRow,
  clusterDecision,
  entityTokens,
  rankClusterCandidates,
  sameLink,
} from './clustering.js';

describe('constants', () => {
  it('match F2.1', () => {
    expect([
      CLUSTER_CANDIDATE_MIN_SCORE,
      CLUSTER_MIN_CONFIDENCE,
      CLUSTER_MAX_SIZE,
      CLUSTER_MAX_CANDIDATES,
      CLUSTER_SIGNAL_WEIGHTS,
    ]).toEqual([0.2, 0.8, 12, 5, { trgm: 0.55, ent: 0.35, link: 0.1 }]);
  });
});

describe('entityTokens', () => {
  it('keeps capitalised and product-like words, versions, the repo slug and a project domain', () => {
    const tokens = entityTokens(
      'Show HN: TypeScript v5.2 and Node.js 22.1 ship with k8s support',
      'https://github.com/Microsoft/TypeScript/releases/tag/v5.2',
    );
    expect(tokens).toEqual(
      new Set(['typescript', '5.2', 'node.js', '22.1', 'k8s', 'microsoft/typescript']),
    );
  });

  it('counts a patch version as its release line, and a bare number after a name as that major version', () => {
    expect(entityTokens('Node.js v26.5.0 (Current)', 'https://nodejs.org/x')).toContain('26.5');
    const bare = entityTokens('SQLite 4 is here', 'https://dev.to/x');
    expect(bare).toEqual(entityTokens('SQLite 4.0 announced', 'https://dev.to/y'));
  });

  it('drops the stoplist and plain lowercase words, and ignores hosting domains', () => {
    const tokens = entityTokens('How we made the build faster', 'https://news.ycombinator.com/x');
    expect(tokens.size).toBe(0);
  });

  it('adds the domain of a project site', () => {
    expect(entityTokens('Bun is fast', 'https://www.bun.sh/blog/bun-v1.2')).toEqual(
      new Set(['bun', 'bun.sh']),
    );
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

  it('applies only the repo rule on hosts that carry many projects', () => {
    expect(sameLink('https://dev.to/alice', 'https://dev.to/alice/post')).toBe(false);
  });
});

const story = {
  id: 's',
  title: 'React 19.1 released',
  url: 'https://react.dev/blog/react-19-1',
  publishedAt: new Date('2026-11-10T12:00:00Z'),
};

function row(overrides: Partial<ClusterPoolRow> & { id: string }): ClusterPoolRow {
  return {
    title: 'React 19.1 released',
    url: 'https://react.dev/blog/react-19-1',
    publishedAt: new Date('2026-11-10T12:00:00Z'),
    clusterId: null,
    clusterMemberCount: null,
    trgm: 0.9,
    ...overrides,
  };
}

describe('rankClusterCandidates', () => {
  it('scores 0.55 trgm + 0.35 ent + 0.10 link and drops candidates below the floor', () => {
    const [top, ...rest] = rankClusterCandidates(story, [
      row({ id: 'close' }),
      row({ id: 'far', title: 'Cooking pasta', url: 'https://food.example/x', trgm: 0.1 }),
    ]);
    expect(rest).toEqual([]);
    expect(top?.id).toBe('close');
    expect(top?.candidateScore).toBeCloseTo(0.55 * 0.9 + 0.35 * 1 + 0.1 * 1);
  });

  it('offers each cluster once, through its best member', () => {
    const result = rankClusterCandidates(story, [
      row({ id: 'm1', clusterId: 'k', clusterMemberCount: 3, trgm: 0.6 }),
      row({ id: 'm2', clusterId: 'k', clusterMemberCount: 3, trgm: 0.9 }),
      row({ id: 'single', trgm: 0.7 }),
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
      row({ id: 'a', trgm: 0.5 }),
      row({ id: 'b', trgm: 0.5, publishedAt: older }),
      row({ id: 'c', trgm: 0.5 }),
      row({ id: 'top', trgm: 1 }),
      row({ id: 'd', trgm: 0.4 }),
      row({ id: 'e', trgm: 0.3 }),
      row({ id: 'f', trgm: 0.35 }),
    ];
    const result = rankClusterCandidates(story, pool);
    expect(result.map(({ id }) => id)).toEqual(['top', 'c', 'a', 'b', 'd']);
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
