import { jaccard, normalizeTitle, trigramsOf } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { readClusterPairs, readHeldOutPairs } from '../clusterPairs.js';
import { useTestDatabase } from './testDatabase.js';

describe('trigram similarity', () => {
  const prisma = useTestDatabase();

  it('AC-2.1.2 equals pg_trgm similarity() for every pair of fixture titles', async () => {
    const titles = [
      ...new Set(
        [...readClusterPairs(), ...readHeldOutPairs()].flatMap(({ a, b }) => [
          normalizeTitle(a.title),
          normalizeTitle(b.title),
        ]),
      ),
    ];
    const rows = await prisma.$queryRaw<{ i: number; j: number; trgm: number }[]>`
      SELECT a.i::int AS i, b.j::int AS j, similarity(a.t, b.t)::float8 AS trgm
      FROM unnest(${titles}::text[]) WITH ORDINALITY AS a(t, i),
           unnest(${titles}::text[]) WITH ORDINALITY AS b(t, j)
      WHERE a.i < b.j`;

    expect(rows).toHaveLength((titles.length * (titles.length - 1)) / 2);
    const mismatches = rows.flatMap(({ i, j, trgm }) => {
      const [first, second] = [titles[i - 1] ?? '', titles[j - 1] ?? ''];
      const ours = jaccard(trigramsOf(first), trigramsOf(second));
      // pg_trgm's similarity() is a float4, hence the tolerance.
      return Math.abs(ours - trgm) > 1e-6 ? [`${first} | ${second}: ${ours} vs ${trgm}`] : [];
    });
    expect(mismatches).toEqual([]);
  });
});
