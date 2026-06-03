export interface AnswerRecord {
  submission_id: string;
  question_id: string;
  answer: unknown;
  created_at: string;
}

export interface SubmissionRecord {
  submission_id: string;
  created_at: string;
  completed: boolean;
  /** Which survey data file version this submission targets. */
  survey_version: string;
  /** Last section index the user was on — persisted server-side. */
  current_section_index: number;
  /** Last question answered, used for fine-grained resume positioning. */
  last_question_id: string | null;
  updated_at: string;
}

export interface DatabaseSchema {
  submissions: SubmissionRecord[];
  answers: AnswerRecord[];
}

export interface SubmissionWithAnswers extends SubmissionRecord {
  answers: Record<string, unknown>;
}

export interface CompletedSubmissionWithAnswers extends SubmissionWithAnswers {
  completed: true;
}

// ── Token types ────────────────────────────────────────────────────────────────

export type TokenStatus = 'issued' | 'consumed' | 'expired' | 'revoked';

export interface ResumeTokenRecord {
  token_hash: string;
  source_submission_id: string;
  target_survey_version: string;
  target_section_index: number;
  status: TokenStatus;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  metadata_json: string | null;
}

/**
 * Returned to the client after a token is successfully consumed.
 * The frontend uses this to select the right survey version and jump to the
 * correct section.
 */
export interface ResumeContext {
  targetSurveyVersion: string;
  targetSectionIndex: number;
  sourceSubmissionId: string;
}

/**
 * Returned to the issuing client when a token is created.
 * The raw `token` value is only available at issuance time and is never stored.
 */
export interface IssueTokenResult {
  /** Raw base64url token — share this in the resume URL. */
  token: string;
  expiresAt: string;
  /** Relative URL fragment the client can embed in a link. */
  resumeUrl: string;
}
