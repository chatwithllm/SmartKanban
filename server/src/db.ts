import pg from 'pg';

// Return DATE columns as plain ISO strings (YYYY-MM-DD) rather than JS Date objects,
// so callers receive the string type declared in the Card type definitions.
pg.types.setTypeParser(pg.types.builtins.DATE, (val: string) => val);

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://kanban:kanban@localhost:5432/kanban';

export const pool = new pg.Pool({ connectionString });
