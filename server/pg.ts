/**
 * pg.ts — PostgreSQL adapter
 *
 * Drop-in replacement for db.ts that uses a PostgreSQL connection pool
 * instead of an in-memory sql.js instance.  The public API surface is
 * identical:  initDb / getDb / persist.
 *
 * The `persist()` call becomes a no-op because PostgreSQL auto-commits
 * each statement and handles durability itself.
 *
 * Environment variables:
 *   DATABASE_URL  — full connection string (takes precedence)
 *   PGHOST        — host (default localhost)
 *   PGPORT        — port (default 5432)
 *   PGDATABASE    — database name (default survey_site)
 *   PGUSER        — user (default postgres)
 *   PGPASSWORD    — password (default empty)
 */

import pg from 'pg';

let _pool: pg.Pool | null = null;

// ── Schema (PostgreSQL-flavoured) ────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS submissions (
    submission_id         VARCHAR(128) PRIMARY KEY,
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    completed             BOOLEAN NOT NULL DEFAULT FALSE,
    lifecycle_state       VARCHAR(20) NOT NULL DEFAULT 'active',
    completed_at          TIMESTAMP,
    archived_at           TIMESTAMP,
    survey_version        VARCHAR(64) NOT NULL DEFAULT 'default',
    current_section_index INTEGER NOT NULL DEFAULT 0,
    last_question_id      VARCHAR(64),
    updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS answers (
    submission_id VARCHAR(128) NOT NULL,
    question_id   VARCHAR(64) NOT NULL,
    answer_json   JSONB NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (submission_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS resume_tokens (
    token_hash            VARCHAR(64) PRIMARY KEY,
    source_submission_id  VARCHAR(128) NOT NULL,
    target_survey_version VARCHAR(64) NOT NULL DEFAULT 'default',
    target_section_index  INTEGER NOT NULL DEFAULT 0,
    status                VARCHAR(20) NOT NULL DEFAULT 'issued',
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at            TIMESTAMP NOT NULL,
    consumed_at           TIMESTAMP,
    metadata_json         JSONB
  );

  CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_source ON resume_tokens(source_submission_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_status ON resume_tokens(status);
`;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * One-time async startup — creates a connection pool and applies the schema DDL.
 * Call this in server.ts before `app.listen()`.
 */
export async function initDb(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const config: pg.PoolConfig = connectionString
    ? { connectionString, max: 10 }
    : {
        host:     process.env.PGHOST     ?? 'localhost',
        port:     parseInt(process.env.PGPORT ?? '5432', 10),
        database: process.env.PGDATABASE ?? 'survey_site',
        user:     process.env.PGUSER     ?? 'postgres',
        password: process.env.PGPASSWORD ?? '',
        max:      10,
      };

  _pool = new pg.Pool(config);

  // Verify connectivity and apply schema
  const client = await _pool.connect();
  try {
    await client.query(SCHEMA);
    console.log('[db] PostgreSQL connected and schema applied');
  } finally {
    client.release();
  }
}

/**
 * Returns the live connection pool.
 * Throws if called before `initDb()` has resolved.
 */
export function getDb(): pg.Pool {
  if (!_pool) throw new Error('[db] PostgreSQL pool not initialised — call initDb() first');
  return _pool;
}

/**
 * No-op — PostgreSQL auto-commits each statement and handles durability itself.
 * Exists only to satisfy the adapter interface used by database.ts.
 */
export function persist(): void {
  // intentionally empty
}

/**
 * Convenience wrapper around pool.query().
 * Kept separate so database.ts can import it for simpler call sites.
 */
export async function query(text: string, params?: unknown[]): Promise<pg.QueryResult> {
  return getDb().query(text, params);
}
