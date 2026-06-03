/**
 * db.ts — sql.js SQLite adapter
 *
 * sql.js loads the entire SQLite database into memory (via WebAssembly). Every
 * mutation must call `persist()` to flush the in-memory state back to disk.
 *
 * Migration path:
 *   Replace this file with a better-sqlite3 or pg adapter that exposes the
 *   same `initDb() / getDb() / persist()` surface and nothing else needs to
 *   change in database.ts.
 */
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Persist the SQLite file alongside the existing survey_responses.json so
// both can be compared during the transition period.
const DB_PATH = path.join(__dirname, 'survey_responses.db');
// Resolve the sql.js dist directory via Node module resolution so the path is
// correct in both `tsx server/server.ts` (dev) and `dist/server.js` (built).
const _req = createRequire(import.meta.url);
const SQLJS_DIR = path.dirname(_req.resolve('sql.js'));
let _db;
// ── Schema ────────────────────────────────────────────────────────────────────
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS submissions (
    submission_id         TEXT    PRIMARY KEY,
    created_at            TEXT    NOT NULL,
    completed             INTEGER NOT NULL DEFAULT 0,
    survey_version        TEXT    NOT NULL DEFAULT 'default',
    current_section_index INTEGER NOT NULL DEFAULT 0,
    last_question_id      TEXT,
    updated_at            TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS answers (
    submission_id TEXT NOT NULL,
    question_id   TEXT NOT NULL,
    answer_json   TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (submission_id, question_id)
  );

  /*
   * resume_tokens
   *
   * Lifecycle: issued → consumed | expired | revoked
   *
   * The raw token is returned to the client exactly once and never stored.
   * Only the SHA-256 hash is persisted so a database breach does not expose
   * usable tokens.
   *
   * One-time use: status transitions to 'consumed' on first valid redemption.
   * Tokens past expires_at are marked 'expired' lazily on the next consume
   * attempt.
   */
  CREATE TABLE IF NOT EXISTS resume_tokens (
    token_hash            TEXT    NOT NULL PRIMARY KEY,
    source_submission_id  TEXT    NOT NULL,
    target_survey_version TEXT    NOT NULL DEFAULT 'default',
    target_section_index  INTEGER NOT NULL DEFAULT 0,
    status                TEXT    NOT NULL DEFAULT 'issued',
    created_at            TEXT    NOT NULL,
    expires_at            TEXT    NOT NULL,
    consumed_at           TEXT,
    metadata_json         TEXT
  );
`;
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * One-time async startup — call this in server.ts before `app.listen()`.
 * Loads an existing .db file from disk (if present) or creates a fresh one,
 * then applies the schema DDL.
 */
export async function initDb() {
    const SQL = await initSqlJs({
        locateFile: (file) => path.join(SQLJS_DIR, file),
    });
    const fileBuffer = existsSync(DB_PATH) ? readFileSync(DB_PATH) : null;
    _db = new SQL.Database(fileBuffer ?? undefined);
    _db.run(SCHEMA);
    persist();
    console.log(`[db] SQLite database ready at ${DB_PATH}`);
}
/**
 * Returns the live database handle.
 * Throws if called before `initDb()` has resolved.
 */
export function getDb() {
    if (!_db)
        throw new Error('[db] Database not initialised — call initDb() first');
    return _db;
}
/**
 * Flush the current in-memory state to disk.
 * Must be called after every write operation to ensure durability.
 *
 * Future: with better-sqlite3 this becomes a no-op (writes are synchronous);
 * with a pg adapter it becomes a no-op too (each statement auto-commits).
 */
export function persist() {
    writeFileSync(DB_PATH, Buffer.from(_db.export()));
}
