/**
 * duckdb.ts — Local DuckDB adapter for transactional storage.
 *
 * Uses @duckdb/node-api to create a local DuckDB database file for
 * submissions, answers, and resume_tokens. This is the fast, offline-capable
 * write store. Analytics ELT reads from this store and syncs to MotherDuck.
 *
 * DuckDB uses `?` placeholders (like SQLite) and auto-persists to disk.
 *
 * Environment variables:
 *   DUCKDB_PATH — local file path (default: server/survey_responses.db)
 */

import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DUCKDB_PATH = process.env.DUCKDB_PATH
  ?? path.join(__dirname, 'survey_responses.db');

let _conn: DuckDBConnection | null = null;

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS submissions (
    submission_id         VARCHAR PRIMARY KEY,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed             BOOLEAN DEFAULT FALSE,
    lifecycle_state       VARCHAR DEFAULT 'active',
    completed_at          TIMESTAMP,
    archived_at           TIMESTAMP,
    survey_version        VARCHAR DEFAULT 'default',
    current_section_index INTEGER DEFAULT 0,
    last_question_id      VARCHAR,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS answers (
    submission_id VARCHAR NOT NULL,
    question_id   VARCHAR NOT NULL,
    answer_json   JSON,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (submission_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS resume_tokens (
    token_hash            VARCHAR PRIMARY KEY,
    source_submission_id  VARCHAR NOT NULL,
    target_survey_version VARCHAR DEFAULT 'default',
    target_section_index  INTEGER DEFAULT 0,
    status                VARCHAR DEFAULT 'issued',
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at            TIMESTAMP NOT NULL,
    consumed_at           TIMESTAMP,
    metadata_json         JSON
  );

  CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_source ON resume_tokens(source_submission_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_status ON resume_tokens(status);
`;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * One-time async startup — creates/opens the local DuckDB file and applies schema.
 * Call this in server.ts before `app.listen()`.
 */
export async function initDb(): Promise<void> {
  const instance = await DuckDBInstance.create(DUCKDB_PATH);
  _conn = await instance.connect();

  await _conn.run('PRAGMA threads=4');

  // Apply schema statements one at a time (DuckDB doesn't support multi-statement exec)
  const statements = SCHEMA.split(';').map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await _conn.run(stmt);
  }

  console.log(`[db] Local DuckDB ready at ${DUCKDB_PATH}`);
}

/**
 * Returns the live DuckDB connection.
 * Throws if called before `initDb()` has resolved.
 */
export function getConn(): DuckDBConnection {
  if (!_conn) throw new Error('[db] DuckDB connection not initialised — call initDb() first');
  return _conn;
}

/**
 * No-op — DuckDB auto-persists to the local file.
 * Exists only to satisfy the adapter interface used by database.ts.
 */
export function persist(): void {
  // intentionally empty
}

/**
 * Run a statement that doesn't return rows (INSERT, UPDATE, DELETE, DDL).
 */
export async function run(sql: string, params?: unknown[]): Promise<void> {
  const conn = getConn();
  await conn.run(sql, params);
}

/**
 * Run a query and return rows as an array of objects.
 */
export async function query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
  const conn = getConn();
  const result = await conn.runAndReadAll(sql, params ?? []);
  return result.getRowObjectsJS() as Record<string, unknown>[];
}

/**
 * Run a query and return the first row, or null if no rows.
 */
export async function queryOne(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}
