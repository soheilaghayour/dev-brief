import { describe, expect, it } from 'vitest';
import { confirmDatabase, databaseTarget } from './confirmDatabase.js';

const URL = 'postgresql://user:pw@db.example.com:5432/devbrief';

describe('confirmDatabase', () => {
  it('reads the host and database name from the URL', () => {
    expect(databaseTarget(URL)).toEqual({ host: 'db.example.com', name: 'devbrief' });
    expect(databaseTarget('postgresql://localhost:5432')).toEqual({
      host: 'localhost',
      name: undefined,
    });
  });

  it('reads the host the way pg does: a ?host= query overrides the URL host', () => {
    expect(databaseTarget('postgresql://u@a.example.com/db?host=b.example.com').host).toBe(
      'b.example.com',
    );
  });

  it('refuses when no database was named, and says which one to name and where it is', () => {
    const result = confirmDatabase(URL, undefined);
    const reason = result.kind === 'refused' && result.reason;
    expect(reason).toContain('--confirm-database devbrief');
    expect(reason).toContain('db.example.com');
  });

  it('refuses when the named database is another one', () => {
    expect(confirmDatabase(URL, 'devbrief_test')).toMatchObject({ kind: 'refused' });
  });

  it('refuses a URL with no database name', () => {
    expect(confirmDatabase('postgresql://localhost:5432', 'x')).toMatchObject({ kind: 'refused' });
  });

  it('confirms when the names match', () => {
    expect(confirmDatabase(URL, 'devbrief')).toEqual({ kind: 'confirmed' });
  });
});
