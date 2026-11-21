import { describe, expect, it } from 'vitest';
import { confirmDatabase, databaseName } from './confirmDatabase.js';

const URL = 'postgresql://user:pw@db.example.com:5432/devbrief?sslmode=require';

describe('confirmDatabase', () => {
  it('reads the database name from the URL', () => {
    expect(databaseName(URL)).toBe('devbrief');
    expect(databaseName('postgresql://localhost:5432')).toBeUndefined();
  });

  it('refuses when no database was named, and says which one to name', () => {
    const result = confirmDatabase(URL, undefined);
    expect(result.kind === 'refused' && result.reason).toContain('--confirm-database devbrief');
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
