/** The database name in a Postgres URL, or undefined when the URL has none. */
export function databaseName(databaseUrl: string) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  return name || undefined;
}

export type DatabaseConfirmation = { kind: 'confirmed' } | { kind: 'refused'; reason: string };

/** A command that spends money and replaces rows runs only against the database its caller named: `confirmed` is the name they typed. */
export function confirmDatabase(
  databaseUrl: string,
  confirmed: string | undefined,
): DatabaseConfirmation {
  const actual = databaseName(databaseUrl);
  if (!actual) return { kind: 'refused', reason: 'DATABASE_URL names no database.' };
  if (confirmed === undefined) {
    return {
      kind: 'refused',
      reason: `Refusing to run without --confirm-database ${actual}: it replaces the example briefings in "${actual}" and calls the live model.`,
    };
  }
  if (confirmed !== actual) {
    return {
      kind: 'refused',
      reason: `--confirm-database ${confirmed} does not match the database in DATABASE_URL ("${actual}").`,
    };
  }
  return { kind: 'confirmed' };
}
