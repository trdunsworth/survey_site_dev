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
import { getDb, persist } from './db';
function rowToSubmission(row) {
    return {
        submission_id: row['submission_id'],
        created_at: row['created_at'],
        completed: row['completed'] !== 0,
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
    db.run(`UPDATE submissions SET completed = 1, updated_at = ? WHERE submission_id = ?`, [new Date().toISOString(), submissionId]);
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
            current_section_index, last_question_id, updated_at
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
            current_section_index, last_question_id, updated_at
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
            current_section_index, last_question_id, updated_at
     FROM submissions
     WHERE completed = 1
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
const TOKEN_TTL_DAYS = 30;
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
export const issueResumeToken = async (sourceSubmissionId, targetSurveyVersion, targetSectionIndex) => {
    const db = getDb();
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    db.run(`INSERT INTO resume_tokens
       (token_hash, source_submission_id, target_survey_version,
        target_section_index, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'issued', ?, ?)`, [
        tokenHash,
        sourceSubmissionId,
        targetSurveyVersion,
        targetSectionIndex,
        now.toISOString(),
        expiresAt.toISOString(),
    ]);
    persist();
    return {
        token: rawToken,
        expiresAt: expiresAt.toISOString(),
        resumeUrl: `/?t=${rawToken}`,
    };
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
