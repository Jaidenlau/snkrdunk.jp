import { Pool } from "pg";

// Single pooled connection to the shared spine (Postgres + pgvector).
let _pool: Pool | null = null;
export function pool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Supabase requires SSL in prod; local dev does not.
      ssl: process.env.DATABASE_URL?.includes("localhost") || process.env.DATABASE_URL?.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return _pool;
}

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
}
