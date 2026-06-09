/**
 * database.ts — repository functions over the sql.js SQLite adapter.
 *
 * All functions are async so callers don't need to change when this layer is
 * swapped for better-sqlite3, pg, or another driver.
 *
 * Migration checklist (when moving to a real RDBMS):
 *  1. Replace db.ts with an adapter that exposes the same initDb/getDb surface.
 *  2. Swap `db.run(sql, params)` calls for the driver's prepared-statement API.
 *  3. Remove `persist()` calls — real databases handle durability themselves.
 *  4. Convert `completed INTEGER` ↔ `boolean` coercion to native BOOL.
 */
import crypto from 'crypto';
import { getDb, persist } from './db.js';
const DEFAULT_INCOMPLETE_PURGE_DAYS = 7;
const DEFAULT_COMPLETED_ARCHIVE_DAYS = 365;
function normalizePositiveDays(days, fallback) {
    if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) {
        return fallback;
    }
    return Math.floor(days);
}
function rowsModified(db) {
    const getter = db.getRowsModified;
    if (typeof getter !== 'function') {
        return 0;
    }
    return getter.call(db);
}
function isoDaysAgo(now, days) {
    return new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)).toISOString();
}
function collectPurgeableSubmissionIds(db, incompleteCutoff, sweepAt) {
    const stmt = db.prepare(`SELECT s.submission_id
     FROM submissions s
     WHERE s.completed = 0
       AND s.lifecycle_state = 'active'
       AND s.updated_at <= ?
       AND NOT EXISTS (
         SELECT 1
         FROM resume_tokens t
         WHERE t.source_submission_id = s.submission_id
           AND t.status = 'issued'
           AND t.expires_at > ?
       )`);
    stmt.bind([incompleteCutoff, sweepAt]);
    const ids = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        const submissionId = row['submission_id'];
        if (typeof submissionId === 'string' && submissionId !== '') {
            ids.push(submissionId);
        }
    }
    stmt.free();
    return ids;
}
function placeholders(count) {
    return Array.from({ length: count }, () => '?').join(', ');
}
function deleteBySubmissionIds(db, tableName, ids) {
    if (ids.length === 0) {
        return 0;
    }
    const foreignKey = tableName === 'resume_tokens' ? 'source_submission_id' : 'submission_id';
    db.run(`DELETE FROM ${tableName} WHERE ${foreignKey} IN (${placeholders(ids.length)})`, ids);
    return rowsModified(db);
}
function rowToSubmission(row) {
    return {
        submission_id: row['submission_id'],
        created_at: row['created_at'],
        completed: row['completed'] !== 0,
        lifecycle_state: row['lifecycle_state'] ?? 'active',
        completed_at: row['completed_at'] ?? null,
        archived_at: row['archived_at'] ?? null,
        survey_version: row['survey_version'],
        current_section_index: row['current_section_index'],
        last_question_id: row['last_question_id'],
        updated_at: row['updated_at'],
    };
}
function sha256(raw) {
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}
// ── Answers ───────────────────────────────────────────────────────────────────
export const saveResponse = async (submissionId, questionId, answer) => {
    const db = getDb();
    const now = new Date().toISOString();
    // Upsert answer (SQLite 3.24+ UPSERT syntax)
    db.run(`INSERT INTO answers (submission_id, question_id, answer_json, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(submission_id, question_id) DO UPDATE SET
       answer_json = excluded.answer_json,
       created_at  = excluded.created_at`, [submissionId, questionId, JSON.stringify(answer), now]);
    // Keep last_question_id and updated_at fresh on the parent submission
    db.run(`UPDATE submissions
     SET last_question_id = ?, updated_at = ?
     WHERE submission_id = ?`, [questionId, now, submissionId]);
    persist();
};
// ── Submissions ───────────────────────────────────────────────────────────────
export const createSubmission = async (submissionId, surveyVersion = 'default') => {
    const db = getDb();
    const now = new Date().toISOString();
    db.run(`INSERT INTO submissions
       (submission_id, created_at, completed, survey_version,
        current_section_index, last_question_id, updated_at)
     VALUES (?, ?, 0, ?, 0, NULL, ?)`, [submissionId, now, surveyVersion, now]);
    persist();
};
export const markSubmissionComplete = async (submissionId) => {
    const db = getDb();
    const now = new Date().toISOString();
    db.run(`UPDATE submissions
     SET completed = 1,
         lifecycle_state = 'active',
         completed_at = COALESCE(completed_at, ?),
         archived_at = NULL,
         updated_at = ?
     WHERE submission_id = ?`, [now, now, submissionId]);
    persist();
};
/**
 * Persist section progress server-side so the user can resume from any device,
 * not just the one that holds localStorage.
 */
export const saveSubmissionProgress = async (submissionId, currentSectionIndex, lastQuestionId) => {
    const db = getDb();
    db.run(`UPDATE submissions
     SET current_section_index = ?,
         last_question_id      = COALESCE(?, last_question_id),
         updated_at            = ?
     WHERE submission_id = ?`, [currentSectionIndex, lastQuestionId ?? null, new Date().toISOString(), submissionId]);
    persist();
};
export const getSubmission = async (submissionId) => {
    const db = getDb();
    const subStmt = db.prepare(`SELECT submission_id, created_at, completed, survey_version,
            current_section_index, last_question_id, updated_at,
            lifecycle_state, completed_at, archived_at
     FROM submissions WHERE submission_id = ?`);
    subStmt.bind([submissionId]);
    if (!subStmt.step()) {
        subStmt.free();
        return null;
    }
    const submission = rowToSubmission(subStmt.getAsObject());
    subStmt.free();
    const ansStmt = db.prepare(`SELECT question_id, answer_json FROM answers WHERE submission_id = ?`);
    ansStmt.bind([submissionId]);
    const answers = {};
    while (ansStmt.step()) {
        const r = ansStmt.getAsObject();
        answers[r['question_id']] = JSON.parse(r['answer_json']);
    }
    ansStmt.free();
    return { ...submission, answers };
};
export const getAllSubmissions = async () => {
    const db = getDb();
    const stmt = db.prepare(`SELECT submission_id, created_at, completed, survey_version,
            current_section_index, last_question_id, updated_at,
            lifecycle_state, completed_at, archived_at
     FROM submissions ORDER BY created_at DESC`);
    const rows = [];
    while (stmt.step()) {
        rows.push(rowToSubmission(stmt.getAsObject()));
    }
    stmt.free();
    return rows;
};
/**
 * Extract completed submissions with their full answer payloads for analytics
 * ELT into DuckDB/MotherDuck.
 */
export const getCompletedSubmissionsWithAnswers = async () => {
    const db = getDb();
    const subStmt = db.prepare(`SELECT submission_id, created_at, completed, survey_version,
            current_section_index, last_question_id, updated_at,
            lifecycle_state, completed_at, archived_at
     FROM submissions
     WHERE completed = 1
       AND lifecycle_state = 'active'
     ORDER BY created_at DESC`);
    const rows = [];
    while (subStmt.step()) {
        const submission = rowToSubmission(subStmt.getAsObject());
        const ansStmt = db.prepare(`SELECT question_id, answer_json FROM answers WHERE submission_id = ?`);
        ansStmt.bind([submission.submission_id]);
        const answers = {};
        while (ansStmt.step()) {
            const r = ansStmt.getAsObject();
            answers[r['question_id']] = JSON.parse(r['answer_json']);
        }
        ansStmt.free();
        rows.push({
            ...submission,
            completed: true,
            answers,
        });
    }
    subStmt.free();
    return rows;
};
// ── Token lifecycle ───────────────────────────────────────────────────────────
const TOKEN_TTL_DAYS = 7;
/**
 * Issue a single-use resume token that routes the bearer to a specific survey
 * version and section.
 *
 * Security properties:
 *  - 32 cryptographically-random bytes → 256-bit entropy (base64url encoded)
 *  - Only the SHA-256 hash is stored; the raw token is returned exactly once
 *  - Tokens expire after TOKEN_TTL_DAYS days
 *  - On consumption the status flips to 'consumed' making replay impossible
 */
export const issueResumeToken = async (sourceSubmissionId, targetSurveyVersion, targetSectionIndex, metadata = {}) => {
    const db = getDb();
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    db.run(`INSERT INTO resume_tokens
       (token_hash, source_submission_id, target_survey_version,
        target_section_index, status, created_at, expires_at, metadata_json)
     VALUES (?, ?, ?, ?, 'issued', ?, ?, ?)`, [
        tokenHash,
        sourceSubmissionId,
        targetSurveyVersion,
        targetSectionIndex,
        now.toISOString(),
        expiresAt.toISOString(),
        JSON.stringify(metadata),
    ]);
    persist();
    return {
        token: rawToken,
        expiresAt: expiresAt.toISOString(),
        resumeUrl: `/?t=${rawToken}`,
    };
};
/**
 * Update token metadata for auditability (for example, email delivery status).
 */
export const updateResumeTokenMetadata = async (rawToken, metadataPatch) => {
    const db = getDb();
    const tokenHash = sha256(rawToken);
    const stmt = db.prepare(`SELECT metadata_json FROM resume_tokens WHERE token_hash = ?`);
    stmt.bind([tokenHash]);
    if (!stmt.step()) {
        stmt.free();
        return;
    }
    const row = stmt.getAsObject();
    stmt.free();
    let current = {};
    const raw = row['metadata_json'];
    if (typeof raw === 'string' && raw.trim() !== '') {
        try {
            current = JSON.parse(raw);
        }
        catch {
            current = {};
        }
    }
    const next = {
        ...current,
        ...metadataPatch,
    };
    db.run(`UPDATE resume_tokens SET metadata_json = ? WHERE token_hash = ?`, [JSON.stringify(next), tokenHash]);
    persist();
};
/**
 * Validate and consume a resume token.
 *
 * Returns a ResumeContext on success, or null for any of:
 *  - Unknown token  (hash not found)
 *  - Already consumed / revoked
 *  - Expired (lazily marks the record as 'expired')
 *
 * Returning null for all failure cases is deliberate — callers should not
 * be able to distinguish between "bad token" and "already used".
 */
export const consumeResumeToken = async (rawToken) => {
    const db = getDb();
    const tokenHash = sha256(rawToken);
    const now = new Date().toISOString();
    const stmt = db.prepare(`SELECT source_submission_id, target_survey_version, target_section_index,
            status, expires_at
     FROM resume_tokens WHERE token_hash = ?`);
    stmt.bind([tokenHash]);
    if (!stmt.step()) {
        stmt.free();
        return null; // unknown token
    }
    const row = stmt.getAsObject();
    stmt.free();
    const status = row['status'];
    const expiresAt = row['expires_at'];
    if (status !== 'issued')
        return null; // consumed / revoked
    if (now > expiresAt) {
        // Lazily mark expired for auditability; treat as invalid
        db.run(`UPDATE resume_tokens SET status = 'expired' WHERE token_hash = ?`, [tokenHash]);
        persist();
        return null;
    }
    // Consume the token — one-time use
    db.run(`UPDATE resume_tokens SET status = 'consumed', consumed_at = ? WHERE token_hash = ?`, [now, tokenHash]);
    persist();
    return {
        targetSurveyVersion: row['target_survey_version'],
        targetSectionIndex: row['target_section_index'],
        sourceSubmissionId: row['source_submission_id'],
    };
};
export const runDataRetentionSweep = async (options = {}) => {
    const db = getDb();
    const now = options.now ?? new Date();
    const nowIso = now.toISOString();
    const incompletePurgeDays = normalizePositiveDays(options.incompletePurgeDays, DEFAULT_INCOMPLETE_PURGE_DAYS);
    const completedArchiveDays = normalizePositiveDays(options.completedArchiveDays, DEFAULT_COMPLETED_ARCHIVE_DAYS);
    const incompleteCutoff = isoDaysAgo(now, incompletePurgeDays);
    const archiveCutoff = isoDaysAgo(now, completedArchiveDays);
    db.run(`UPDATE resume_tokens
     SET status = 'expired'
     WHERE status = 'issued' AND expires_at <= ?`, [nowIso]);
    const expiredTokens = rowsModified(db);
    const purgeableSubmissionIds = collectPurgeableSubmissionIds(db, incompleteCutoff, nowIso);
    const purgedAnswers = deleteBySubmissionIds(db, 'answers', purgeableSubmissionIds);
    const purgedTokens = deleteBySubmissionIds(db, 'resume_tokens', purgeableSubmissionIds);
    const purgedSubmissions = deleteBySubmissionIds(db, 'submissions', purgeableSubmissionIds);
    db.run(`UPDATE submissions
     SET lifecycle_state = 'archived',
         archived_at = ?,
         updated_at = ?
     WHERE completed = 1
       AND lifecycle_state = 'active'
       AND COALESCE(completed_at, updated_at, created_at) <= ?`, [nowIso, nowIso, archiveCutoff]);
    const archivedSubmissions = rowsModified(db);
    if (expiredTokens > 0 || purgedSubmissions > 0 || archivedSubmissions > 0) {
        persist();
    }
    return {
        sweepAt: nowIso,
        incompleteCutoff,
        archiveCutoff,
        expiredTokens,
        purgedSubmissions,
        purgedAnswers,
        purgedTokens,
        archivedSubmissions,
    };
};
