export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface QuestionOption {
  option: string;
  otherText?: string;
}

export interface AgencyData {
  agency: string;
  count: string;
  otherType?: string;
}

export type AnswerValue = 
  | string 
  | QuestionOption 
  | (string | QuestionOption | AgencyData)[] 
  | AgencyData[];

export interface Question {
  id: string | number;
  text: string;
  description?: string;
  data_location?: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'select' | 'number' | 'agencies-with-count' | string;
  options?: string[];
  required?: boolean;
  showIf?: {
    questionId: string | number;
    anyOf: string[];
  };
}

export interface Section {
  title: string;
  questions: Question[];
}

export interface SurveyData {
  sections: Section[];
}

export interface Answers {
  [questionId: string]: AnswerValue;
  [questionId: number]: AnswerValue;
}

export interface Submission {
  submission_id: string;
  created_at: string;
  completed: boolean;
  survey_version: string;
  current_section_index: number;
  last_question_id: string | null;
  updated_at: string;
}

export interface Answer {
  submission_id: string;
  question_id: string;
  answer: AnswerValue;
  created_at: string;
}

// ── Token types ────────────────────────────────────────────────────────────────

/** Resume context returned to the client after a valid token is consumed. */
export interface ResumeContext {
  targetSurveyVersion: string;
  targetSectionIndex: number;
  sourceSubmissionId: string;
}

export type TokenConsumeFailureReason = 'invalid' | 'expired' | 'consumed' | 'error';

export interface TokenConsumeResult {
  success: boolean;
  context?: ResumeContext;
  reason?: TokenConsumeFailureReason;
}

export interface TokenIssueResult {
  success: boolean;
  /** Raw base64url token — embed in a /?t=... resume link. */
  token?: string;
  expiresAt?: string;
  resumeUrl?: string;
  ttlDays?: number;
  emailDeliveryStatus?: 'not_requested' | 'sent' | 'failed';
  emailDeliveryError?: string;
  error?: string;
}

export interface AnalyticsHealthResponse {
  duckdbPath: string;
  targetCatalog: string;
  motherduckConfigured: boolean;
  quackRequested: boolean;
  counts: {
    completed_submissions: number;
    completed_answers: number;
  };
  lastRun: {
    run_id: string;
    completed_at: string;
    extracted_submissions: number;
    loaded_submissions: number;
    loaded_answers: number;
    status: string;
    message: string;
  } | null;
}

export interface AnalyticsKpiOverview {
  total_completed_surveys: number;
  survey_versions: number;
  avg_answered_questions: number;
  median_answered_questions: number;
  completed_last_24h: number;
  completed_last_7d: number;
}

export interface AnalyticsDailyCompletion {
  completion_day: string;
  completed_surveys: number;
}

export interface AnalyticsQuestionCompletion {
  question_id: string;
  answered_count: number;
  completion_rate_pct: number;
}

export interface AnalyticsAnswerTypeMix {
  answer_type: string;
  answer_count: number;
  pct_of_answers: number;
}

export interface AnalyticsKpiSnapshot {
  overview: AnalyticsKpiOverview;
  dailyCompletions30d: AnalyticsDailyCompletion[];
  questionCompletion: AnalyticsQuestionCompletion[];
  answerTypeMix: AnalyticsAnswerTypeMix[];
}

export interface AnalyticsRefreshResult {
  success: boolean;
  summary?: {
    extractedSubmissions: number;
    loadedSubmissions: number;
    loadedAnswers: number;
    wideColumns: number;
    targetCatalog: string;
  };
  error?: string;
}
