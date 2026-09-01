/**
 * database.ts — repository functions over the local DuckDB adapter.
 *
 * All functions are async and use the DuckDB connection from duckdb.ts.
 * This version uses DuckDB-compatible SQL:
 *   - ? parameter placeholders
 *   - Native BOOLEAN type
 *   - Native TIMESTAMP type
 *   - JSON type for structured columns
 *   - No persist() calls — DuckDB auto-persists to disk
 */

import crypto from 'crypto';
import { query, run, queryOne } from './duckdb.js';
import type {
  SubmissionRecord,
  SubmissionWithAnswers,
  CompletedSubmissionWithAnswers,
  ResumeContext,
  IssueTokenResult,
} from './types.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

interface TokenIssueMetadata {
  [key: string]: unknown;
}

export interface RetentionSweepOptions {
  now?: Date;
  incompletePurgeDays?: number;
  completedArchiveDays?: number;
}

export interface RetentionSweepSummary {
  sweepAt: string;
  incompleteCutoff: string;
  archiveCutoff: string;
  expiredTokens: number;
  purgedSubmissions: number;
  purgedAnswers: number;
  purgedTokens: number;
  archivedSubmissions: number;
}

const DEFAULT_INCOMPLETE_PURGE_DAYS = 7;
const DEFAULT_COMPLETED_ARCHIVE_DAYS = 365;

function normalizePositiveDays(days: number | undefined, fallback: number): number {
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) {
    return fallback;
  }
  return Math.floor(days);
}

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function duckPlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function rowToSubmission(row: Record<string, unknown>): SubmissionRecord {
  return {
    submission_id:         row['submission_id']         as string,
    created_at:            row['created_at']            as string,
    completed:             row['completed'] === true || row['completed'] === 1,
    lifecycle_state:       (row['lifecycle_state'] as 'active' | 'archived' | undefined) ?? 'active',
    completed_at:          (row['completed_at'] as string | null | undefined) ?? null,
    archived_at:           (row['archived_at'] as string | null | undefined) ?? null,
    survey_version:        row['survey_version']        as string,
    current_section_index: row['current_section_index'] as number,
    last_question_id:      row['last_question_id']      as string | null,
    updated_at:            row['updated_at']            as string,
  };
}

function sha256(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

// ── Answers ───────────────────────────────────────────────────────────────────

export const saveResponse = async (
  submissionId: string,
  questionId: string,
  answer: unknown,
): Promise<void> => {
  const now = new Date().toISOString();

  // Upsert answer (DuckDB UPSERT syntax)
  await run(
    `INSERT INTO answers (submission_id, question_id, answer_json, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(submission_id, question_id) DO UPDATE SET
       answer_json = EXCLUDED.answer_json,
       created_at  = EXCLUDED.created_at`,
    [submissionId, questionId, JSON.stringify(answer), now],
  );

  // Keep last_question_id and updated_at fresh on the parent submission
  await run(
    `UPDATE submissions
     SET last_question_id = ?, updated_at = ?
     WHERE submission_id = ?`,
    [questionId, now, submissionId],
  );
};

// ── Submissions ───────────────────────────────────────────────────────────────

export const createSubmission = async (
  submissionId: string,
  surveyVersion = 'default',
): Promise<void> => {
  const now = new Date().toISOString();

  await run(
    `INSERT INTO submissions
       (submission_id, created_at, completed, survey_version,
        current_section_index, last_question_id, updated_at)
     VALUES (?, ?, FALSE, ?, 0, NULL, ?)`,
    [submissionId, now, surveyVersion, now],
  );
};

export const markSubmissionComplete = async (submissionId: string): Promise<void> => {
  const now = new Date().toISOString();
  await run(
    `UPDATE submissions
     SET completed = TRUE,
         lifecycle_state = 'active',
         completed_at = COALESCE(completed_at, ?),
         archived_at = NULL,
         updated_at = ?
     WHERE submission_id = ?`,
    [now, now, submissionId],
  );
};

/**
 * Persist section progress server-side so the user can resume from any device,
 * not just the one that holds localStorage.
 */
export const saveSubmissionProgress = async (
  submissionId: string,
  currentSectionIndex: number,
  lastQuestionId?: string,
): Promise<void> => {
  await run(
    `UPDATE submissions
     SET current_section_index = ?,
         last_question_id      = COALESCE(?, last_question_id),
         updated_at            = ?
     WHERE submission_id = ?`,
    [currentSectionIndex, lastQuestionId ?? null, new Date().toISOString(), submissionId],
  );
};

export const getSubmission = async (
  submissionId: string,
): Promise<SubmissionWithAnswers | null> => {
  const subRow = await queryOne(
    `SELECT submission_id, created_at, completed, survey_version,
            current_section_index, last_question_id, updated_at,
            lifecycle_state, completed_at, archived_at
     FROM submissions WHERE submission_id = ?`,
    [submissionId],
  );

  if (!subRow) return null;
  const submission = rowToSubmission(subRow);

  const ansRows = await query(
    `SELECT question_id, answer_json FROM answers WHERE submission_id = ?`,
    [submissionId],
  );

  const answers: Record<string, unknown> = {};
  for (const r of ansRows) {
    answers[r['question_id'] as string] = typeof r['answer_json'] === 'string'
      ? JSON.parse(r['answer_json'] as string)
      : r['answer_json'];
  }

  return { ...submission, answers };
};

export const getAllSubmissions = async (): Promise<SubmissionRecord[]> => {
  const rows = await query(
    `SELECT submission_id, created_at, completed, survey_version,
            current_section_index, last_question_id, updated_at,
            lifecycle_state, completed_at, archived_at
     FROM submissions ORDER BY created_at DESC`,
  );

  return rows.map(rowToSubmission);
};

/**
 * Extract completed submissions with their full answer payloads for analytics
 * ELT into MotherDuck.
 */
export const getCompletedSubmissionsWithAnswers = async (): Promise<CompletedSubmissionWithAnswers[]> => {
  const subRows = await query(
    `SELECT submission_id, created_at, completed, survey_version,
            current_section_index, last_question_id, updated_at,
            lifecycle_state, completed_at, archived_at
     FROM submissions
     WHERE completed = TRUE
       AND lifecycle_state = 'active'
     ORDER BY created_at DESC`,
  );

  const rows: CompletedSubmissionWithAnswers[] = [];

  for (const subRow of subRows) {
    const submission = rowToSubmission(subRow);

    const ansRows = await query(
      `SELECT question_id, answer_json FROM answers WHERE submission_id = ?`,
      [submission.submission_id],
    );

    const answers: Record<string, unknown> = {};
    for (const r of ansRows) {
      answers[r['question_id'] as string] = typeof r['answer_json'] === 'string'
        ? JSON.parse(r['answer_json'] as string)
        : r['answer_json'];
    }

    rows.push({
      ...submission,
      completed: true,
      answers,
    });
  }

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
export const issueResumeToken = async (
  sourceSubmissionId: string,
  targetSurveyVersion: string,
  targetSectionIndex: number,
  metadata: TokenIssueMetadata = {},
): Promise<IssueTokenResult> => {
  const rawToken  = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(rawToken);

  const now       = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await run(
    `INSERT INTO resume_tokens
       (token_hash, source_submission_id, target_survey_version,
        target_section_index, status, created_at, expires_at, metadata_json)
     VALUES (?, ?, ?, ?, 'issued', ?, ?, ?)`,
    [
      tokenHash,
      sourceSubmissionId,
      targetSurveyVersion,
      targetSectionIndex,
      now.toISOString(),
      expiresAt.toISOString(),
      JSON.stringify(metadata),
    ],
  );

  return {
    token:     rawToken,
    expiresAt: expiresAt.toISOString(),
    resumeUrl: `/?t=${rawToken}`,
  };
};

/**
 * Update token metadata for auditability (for example, email delivery status).
 */
export const updateResumeTokenMetadata = async (
  rawToken: string,
  metadataPatch: TokenIssueMetadata,
): Promise<void> => {
  const tokenHash = sha256(rawToken);

  const row = await queryOne(
    `SELECT metadata_json FROM resume_tokens WHERE token_hash = ?`,
    [tokenHash],
  );

  if (!row) return;

  let current: TokenIssueMetadata = {};
  const raw = row['metadata_json'];
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      current = JSON.parse(raw) as TokenIssueMetadata;
    } catch {
      current = {};
    }
  } else if (raw && typeof raw === 'object') {
    // JSON may already be parsed by DuckDB driver
    current = raw as TokenIssueMetadata;
  }

  const next = { ...current, ...metadataPatch };

  await run(
    `UPDATE resume_tokens SET metadata_json = ? WHERE token_hash = ?`,
    [JSON.stringify(next), tokenHash],
  );
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
export const consumeResumeToken = async (
  rawToken: string,
): Promise<ResumeContext | null> => {
  const tokenHash = sha256(rawToken);
  const now       = new Date().toISOString();

  const row = await queryOne(
    `SELECT source_submission_id, target_survey_version, target_section_index,
            status, expires_at
     FROM resume_tokens WHERE token_hash = ?`,
    [tokenHash],
  );

  if (!row) return null; // unknown token

  const status    = row['status']    as string;
  const expiresAt = row['expires_at'] as string;

  if (status !== 'issued') return null; // consumed / revoked

  if (now > expiresAt) {
    // Lazily mark expired for auditability; treat as invalid
    await run(`UPDATE resume_tokens SET status = 'expired' WHERE token_hash = ?`, [tokenHash]);
    return null;
  }

  // Consume the token — one-time use
  await run(
    `UPDATE resume_tokens SET status = 'consumed', consumed_at = ? WHERE token_hash = ?`,
    [now, tokenHash],
  );

  return {
    targetSurveyVersion: row['target_survey_version'] as string,
    targetSectionIndex:  row['target_section_index']  as number,
    sourceSubmissionId:  row['source_submission_id']  as string,
  };
};

// ── Data retention ────────────────────────────────────────────────────────────

async function collectPurgeableSubmissionIds(
  incompleteCutoff: string,
  sweepAt: string,
): Promise<string[]> {
  const rows = await query(
    `SELECT s.submission_id
     FROM submissions s
     WHERE s.completed = FALSE
       AND s.lifecycle_state = 'active'
       AND s.updated_at <= ?
       AND NOT EXISTS (
         SELECT 1
         FROM resume_tokens t
         WHERE t.source_submission_id = s.submission_id
           AND t.status = 'issued'
           AND t.expires_at > ?
       )`,
    [incompleteCutoff, sweepAt],
  );

  return rows.map((r) => r['submission_id'] as string).filter(Boolean);
}

async function deleteBySubmissionIds(
  tableName: 'answers' | 'resume_tokens' | 'submissions',
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;

  const foreignKey = tableName === 'resume_tokens' ? 'source_submission_id' : 'submission_id';
  // DuckDB doesn't return rowCount directly, so we count before/after or just run
  await run(
    `DELETE FROM ${tableName} WHERE ${foreignKey} IN (${duckPlaceholders(ids.length)})`,
    ids,
  );

  // For retention purposes, return the count of IDs we attempted to delete
  // DuckDB runAndReadAll doesn't easily give us rowCount for DELETE
  return ids.length;
}

export const runDataRetentionSweep = async (
  options: RetentionSweepOptions = {},
): Promise<RetentionSweepSummary> => {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  const incompletePurgeDays = normalizePositiveDays(
    options.incompletePurgeDays,
    DEFAULT_INCOMPLETE_PURGE_DAYS,
  );
  const completedArchiveDays = normalizePositiveDays(
    options.completedArchiveDays,
    DEFAULT_COMPLETED_ARCHIVE_DAYS,
  );

  const incompleteCutoff = isoDaysAgo(now, incompletePurgeDays);
  const archiveCutoff = isoDaysAgo(now, completedArchiveDays);

  // Count expired tokens before update
  const expiredRows = await query(
    `SELECT COUNT(*) AS cnt FROM resume_tokens WHERE status = 'issued' AND expires_at <= ?`,
    [nowIso],
  );
  const expiredTokens = expiredRows[0]?.['cnt'] as number ?? 0;

  await run(
    `UPDATE resume_tokens SET status = 'expired' WHERE status = 'issued' AND expires_at <= ?`,
    [nowIso],
  );

  const purgeableSubmissionIds = await collectPurgeableSubmissionIds(incompleteCutoff, nowIso);

  const purgedAnswers    = await deleteBySubmissionIds('answers', purgeableSubmissionIds);
  const purgedTokens     = await deleteBySubmissionIds('resume_tokens', purgeableSubmissionIds);
  const purgedSubmissions = await deleteBySubmissionIds('submissions', purgeableSubmissionIds);

  // Count archived submissions before update
  const archiveCountRows = await query(
    `SELECT COUNT(*) AS cnt FROM submissions
     WHERE completed = TRUE
       AND lifecycle_state = 'active'
       AND COALESCE(completed_at, updated_at, created_at) <= ?`,
    [archiveCutoff],
  );
  const archivedSubmissions = archiveCountRows[0]?.['cnt'] as number ?? 0;

  await run(
    `UPDATE submissions
     SET lifecycle_state = 'archived',
         archived_at = ?,
         updated_at = ?
     WHERE completed = TRUE
       AND lifecycle_state = 'active'
       AND COALESCE(completed_at, updated_at, created_at) <= ?`,
    [nowIso, nowIso, archiveCutoff],
  );

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
