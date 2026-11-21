import { parse } from 'pg-connection-string';

/** The host and database a Postgres URL points at, read the way `pg` reads it (a `?host=` query overrides the host part). */
export function databaseTarget(databaseUrl: string) {
  const { host, database } = parse(databaseUrl);
  return { host: host ?? 'unknown host', name: database || undefined };
}

export type DatabaseConfirmation = { kind: 'confirmed' } | { kind: 'refused'; reason: string };

/** A command that spends money and replaces rows runs only against the database its caller named: `confirmed` is the name they typed. */
export function confirmDatabase(
  databaseUrl: string,
  confirmed: string | undefined,
): DatabaseConfirmation {
  const { host, name } = databaseTarget(databaseUrl);
  if (!name) return { kind: 'refused', reason: 'DATABASE_URL names no database.' };
  if (confirmed === undefined) {
    return {
      kind: 'refused',
      reason: `Refusing to run without --confirm-database ${name}: it replaces the example briefings in "${name}" on ${host} and calls the live model.`,
    };
  }
  if (confirmed !== name) {
    return {
      kind: 'refused',
      reason: `--confirm-database ${confirmed} does not match the database in DATABASE_URL ("${name}" on ${host}).`,
    };
  }
  return { kind: 'confirmed' };
}
