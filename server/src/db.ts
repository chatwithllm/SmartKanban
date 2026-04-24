import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://kanban:kanban@localhost:5432/kanban';

export const pool = new pg.Pool({ connectionString });
