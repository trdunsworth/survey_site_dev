-- Submissions
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

-- Answers
CREATE TABLE IF NOT EXISTS answers (
  submission_id VARCHAR(128) NOT NULL,
  question_id   VARCHAR(64) NOT NULL,
  answer_json   JSONB NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (submission_id, question_id)
);

-- Resume tokens
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_tokens_source ON resume_tokens(source_submission_id);
CREATE INDEX IF NOT EXISTS idx_tokens_status ON resume_tokens(status);
