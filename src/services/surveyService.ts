import { Observable, Subject, of, fromEvent, merge } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  retry,
  catchError,
  tap,
  filter,
  map,
  startWith,
} from 'rxjs/operators';
import type {
  AnswerValue,
  TokenConsumeResult,
  TokenIssueResult,
  ResumeContext,
  AnalyticsHealthResponse,
  AnalyticsKpiSnapshot,
  AnalyticsRefreshResult,
} from '../types';

// Frontend API base URL is configurable via Vite env
// Defaults to '/api' so it can be reverse-proxied under the site
const API_URL = (import.meta as any).env?.VITE_API_URL ?? '/api';
const STATIC_MODE =
  (import.meta as any).env?.VITE_STATIC_MODE === 'true' ||
  (import.meta as any).env?.MODE === 'static';

const STATIC_STORE_KEY = 'survey_static_store_v1';
const STATIC_TOKEN_TTL_DAYS = 7;

interface StaticSubmission {
  submission_id: string;
  created_at: string;
  completed: boolean;
  survey_version: string;
  current_section_index: number;
  last_question_id: string | null;
  updated_at: string;
  completed_at?: string;
  answers: Record<string, AnswerValue>;
}

interface StaticToken {
  token: string;
  sourceSubmissionId: string;
  targetSurveyVersion: string;
  targetSectionIndex: number;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

interface StaticStore {
  submissions: Record<string, StaticSubmission>;
  tokens: Record<string, StaticToken>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultStore(): StaticStore {
  return { submissions: {}, tokens: {} };
}

function loadStaticStore(): StaticStore {
  if (!STATIC_MODE) return defaultStore();
  try {
    const raw = localStorage.getItem(STATIC_STORE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw) as Partial<StaticStore>;
    return {
      submissions: parsed.submissions ?? {},
      tokens: parsed.tokens ?? {},
    };
  } catch {
    return defaultStore();
  }
}

function saveStaticStore(store: StaticStore): void {
  if (!STATIC_MODE) return;
  localStorage.setItem(STATIC_STORE_KEY, JSON.stringify(store));
}

function createStaticToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function computeStaticKpis(store: StaticStore): AnalyticsKpiSnapshot {
  const completed = Object.values(store.submissions).filter((s) => s.completed);
  const totalCompleted = completed.length;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const answeredCounts = completed.map((s) => Object.keys(s.answers || {}).length).sort((a, b) => a - b);
  const avgAnswered = totalCompleted === 0
    ? 0
    : answeredCounts.reduce((sum, value) => sum + value, 0) / totalCompleted;
  const medianAnswered = totalCompleted === 0
    ? 0
    : answeredCounts[Math.floor((answeredCounts.length - 1) / 2)];
  const surveyVersions = new Set(completed.map((s) => s.survey_version || 'default')).size;

  let completedLast24h = 0;
  let completedLast7d = 0;
  const dailyMap: Record<string, number> = {};
  const questionCountMap: Record<string, number> = {};
  const answerTypeMap: Record<string, number> = {};

  for (const submission of completed) {
    const completedAt = new Date(submission.completed_at ?? submission.updated_at).getTime();
    if (Number.isFinite(completedAt)) {
      if (now - completedAt <= dayMs) completedLast24h += 1;
      if (now - completedAt <= 7 * dayMs) completedLast7d += 1;
      if (now - completedAt <= 30 * dayMs) {
        const day = new Date(completedAt).toISOString().slice(0, 10);
        dailyMap[day] = (dailyMap[day] ?? 0) + 1;
      }
    }

    Object.entries(submission.answers || {}).forEach(([questionId, answer]) => {
      questionCountMap[questionId] = (questionCountMap[questionId] ?? 0) + 1;

      let answerType: string = typeof answer;
      if (Array.isArray(answer)) answerType = 'array';
      else if (answer && typeof answer === 'object') {
        if ('option' in answer) answerType = 'option-object';
        else if ('agency' in (answer as Record<string, unknown>)) answerType = 'agency-count';
        else answerType = 'object';
      }
      answerTypeMap[answerType] = (answerTypeMap[answerType] ?? 0) + 1;
    });
  }

  const dailyCompletions30d = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([completion_day, completed_surveys]) => ({ completion_day, completed_surveys }));

  const questionCompletion = Object.entries(questionCountMap)
    .map(([question_id, answered_count]) => ({
      question_id,
      answered_count,
      completion_rate_pct: totalCompleted === 0 ? 0 : (answered_count / totalCompleted) * 100,
    }))
    .sort((a, b) => b.answered_count - a.answered_count);

  const totalAnswers = Object.values(answerTypeMap).reduce((sum, count) => sum + count, 0);
  const answerTypeMix = Object.entries(answerTypeMap)
    .map(([answer_type, answer_count]) => ({
      answer_type,
      answer_count,
      pct_of_answers: totalAnswers === 0 ? 0 : (answer_count / totalAnswers) * 100,
    }))
    .sort((a, b) => b.answer_count - a.answer_count);

  return {
    overview: {
      total_completed_surveys: totalCompleted,
      survey_versions: surveyVersions,
      avg_answered_questions: avgAnswered,
      median_answered_questions: medianAnswered,
      completed_last_24h: completedLast24h,
      completed_last_7d: completedLast7d,
    },
    dailyCompletions30d,
    questionCompletion,
    answerTypeMix,
  };
}

export interface AnswerChange {
  submissionId: string;
  questionId: string | number;
  answer: AnswerValue;
}

export interface SaveResult {
  success: boolean;
  error?: string;
}

/**
 * Network status observable
 * Emits true when online, false when offline
 */
export const networkStatus$ = merge(
  fromEvent(window, 'online').pipe(map(() => true)),
  fromEvent(window, 'offline').pipe(map(() => false))
).pipe(
  startWith(navigator.onLine),
  distinctUntilChanged()
);

/**
 * Create submission in the database
 */
export function createSubmission(submissionId: string): Observable<SaveResult> {
  if (STATIC_MODE) {
    const store = loadStaticStore();
    const timestamp = nowIso();
    store.submissions[submissionId] = {
      submission_id: submissionId,
      created_at: timestamp,
      completed: false,
      survey_version: 'default',
      current_section_index: 0,
      last_question_id: null,
      updated_at: timestamp,
      answers: {},
    };
    saveStaticStore(store);
    return of({ success: true });
  }

  return new Observable<SaveResult>((observer) => {
    fetch(`${API_URL}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(() => {
        observer.next({ success: true });
        observer.complete();
      })
      .catch((err) => {
        observer.error(err);
      });
  }).pipe(
    retry({ count: 3, delay: 1000 }),
    catchError((err) => {
      console.error('Failed to create submission:', err);
      return of({ success: false, error: err.message });
    })
  );
}

/**
 * Save a single answer to the database
 */
export function saveAnswer(data: AnswerChange): Observable<SaveResult> {
  if (STATIC_MODE) {
    const store = loadStaticStore();
    const existing = store.submissions[data.submissionId];
    const timestamp = nowIso();
    const submission: StaticSubmission = existing ?? {
      submission_id: data.submissionId,
      created_at: timestamp,
      completed: false,
      survey_version: 'default',
      current_section_index: 0,
      last_question_id: null,
      updated_at: timestamp,
      answers: {},
    };
    submission.answers[String(data.questionId)] = data.answer;
    submission.updated_at = timestamp;
    store.submissions[data.submissionId] = submission;
    saveStaticStore(store);
    return of({ success: true });
  }

  return new Observable<SaveResult>((observer) => {
    fetch(`${API_URL}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submissionId: data.submissionId,
        questionId: data.questionId,
        answer: data.answer,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(() => {
        observer.next({ success: true });
        observer.complete();
      })
      .catch((err) => {
        observer.error(err);
      });
  });
}

/**
 * Complete the submission
 */
export function completeSubmission(submissionId: string): Observable<SaveResult> {
  if (STATIC_MODE) {
    const store = loadStaticStore();
    const submission = store.submissions[submissionId];
    if (!submission) {
      return of({ success: false, error: 'Submission not found' });
    }
    const timestamp = nowIso();
    submission.completed = true;
    submission.completed_at = timestamp;
    submission.updated_at = timestamp;
    store.submissions[submissionId] = submission;
    saveStaticStore(store);
    return of({ success: true });
  }

  return new Observable<SaveResult>((observer) => {
    fetch(`${API_URL}/submissions/${submissionId}/complete`, {
      method: 'POST',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(() => {
        observer.next({ success: true });
        observer.complete();
      })
      .catch((err) => {
        observer.error(err);
      });
  }).pipe(
    retry({ count: 3, delay: 1000 }),
    catchError((err) => {
      console.error('Failed to complete submission:', err);
      return of({ success: false, error: err.message });
    })
  );
}

/**
 * Load an existing submission by ID
 */
export function loadSubmission(submissionId: string): Observable<{
  success: boolean;
  data?: {
    submission_id: string;
    created_at: string;
    completed: boolean;
    survey_version: string;
    current_section_index: number;
    last_question_id: string | null;
    updated_at: string;
    answers: Record<string, any>;
  };
  error?: string;
}> {
  if (STATIC_MODE) {
    const store = loadStaticStore();
    const submission = store.submissions[submissionId];
    if (!submission) {
      return of({ success: false, error: 'Submission not found' });
    }
    return of({
      success: true,
      data: {
        submission_id: submission.submission_id,
        created_at: submission.created_at,
        completed: submission.completed,
        survey_version: submission.survey_version,
        current_section_index: submission.current_section_index,
        last_question_id: submission.last_question_id,
        updated_at: submission.updated_at,
        answers: submission.answers,
      },
    });
  }

  return new Observable<{
    success: boolean;
    data?: {
      submission_id: string;
      created_at: string;
      completed: boolean;
      survey_version: string;
      current_section_index: number;
      last_question_id: string | null;
      updated_at: string;
      answers: Record<string, any>;
    };
    error?: string;
  }>((observer) => {
    fetch(`${API_URL}/submissions/${submissionId}`)
      .then((response) => {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Submission not found');
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        observer.next({ success: true, data });
        observer.complete();
      })
      .catch((err) => {
        observer.error(err);
      });
  }).pipe(
    retry({ count: 2, delay: 1000 }),
    catchError((err) => {
      console.error('Failed to load submission:', err);
      return of({ success: false, error: err.message });
    })
  );
}

/**
 * Consume a one-time resume token.
 * Returns the resume context (target version + section) on success, or a
 * failure result with a generic reason code on failure.
 */
export function consumeToken(rawToken: string): Observable<TokenConsumeResult> {
  if (STATIC_MODE) {
    const token = rawToken.trim();
    const store = loadStaticStore();
    const tokenRecord = store.tokens[token];
    if (!tokenRecord) return of({ success: false, reason: 'invalid' as const });
    if (tokenRecord.consumedAt) return of({ success: false, reason: 'consumed' as const });
    if (Date.now() > new Date(tokenRecord.expiresAt).getTime()) {
      return of({ success: false, reason: 'expired' as const });
    }
    if (!store.submissions[tokenRecord.sourceSubmissionId]) {
      return of({ success: false, reason: 'invalid' as const });
    }
    tokenRecord.consumedAt = nowIso();
    store.tokens[token] = tokenRecord;
    saveStaticStore(store);
    const context: ResumeContext = {
      sourceSubmissionId: tokenRecord.sourceSubmissionId,
      targetSurveyVersion: tokenRecord.targetSurveyVersion,
      targetSectionIndex: tokenRecord.targetSectionIndex,
    };
    return of({ success: true, context });
  }

  return new Observable<TokenConsumeResult>((observer) => {
    fetch(`${API_URL}/tokens/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        observer.next(data as TokenConsumeResult);
        observer.complete();
      })
      .catch((err) => observer.error(err));
  }).pipe(
    retry({ count: 1, delay: 500 }),
    catchError((err) => {
      console.error('Failed to consume token:', err);
      return of({ success: false, reason: 'error' as const });
    })
  );
}

/**
 * Issue a resume token for a given submission, pointing at a target survey
 * version and section index.
 */
export function issueToken(
  sourceSubmissionId: string,
  targetSurveyVersion: string,
  targetSectionIndex: number,
): Observable<TokenIssueResult> {
  if (STATIC_MODE) {
    const store = loadStaticStore();
    const submission = store.submissions[sourceSubmissionId];
    if (!submission) {
      return of({ success: false, error: 'Submission not found' });
    }
    submission.survey_version = targetSurveyVersion;
    store.submissions[sourceSubmissionId] = submission;

    const token = createStaticToken();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + STATIC_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    store.tokens[token] = {
      token,
      sourceSubmissionId,
      targetSurveyVersion,
      targetSectionIndex,
      createdAt,
      expiresAt,
    };
    saveStaticStore(store);

    const resumeUrl = `${window.location.origin}${window.location.pathname}?t=${encodeURIComponent(token)}`;
    return of({
      success: true,
      token,
      expiresAt,
      ttlDays: STATIC_TOKEN_TTL_DAYS,
      resumeUrl,
    });
  }

  return new Observable<TokenIssueResult>((observer) => {
    fetch(`${API_URL}/tokens/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceSubmissionId,
        targetSurveyVersion,
        targetSectionIndex,
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        observer.next(data as TokenIssueResult);
        observer.complete();
      })
      .catch((err) => observer.error(err));
  }).pipe(
    catchError((err) => {
      console.error('Failed to issue token:', err);
      return of({ success: false, error: err.message as string });
    })
  );
}

/**
 * Persist the current section index and optional last question ID on the
 * server. This supplements localStorage for cross-device resume support.
 */
export function saveProgress(
  submissionId: string,
  currentSectionIndex: number,
  lastQuestionId?: string,
): Observable<SaveResult> {
  if (STATIC_MODE) {
    const store = loadStaticStore();
    const submission = store.submissions[submissionId];
    if (!submission) {
      return of({ success: false, error: 'Submission not found' });
    }
    submission.current_section_index = currentSectionIndex;
    submission.last_question_id = lastQuestionId ?? submission.last_question_id;
    submission.updated_at = nowIso();
    store.submissions[submissionId] = submission;
    saveStaticStore(store);
    return of({ success: true });
  }

  return new Observable<SaveResult>((observer) => {
    fetch(`${API_URL}/submissions/${submissionId}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentSectionIndex, lastQuestionId }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then(() => {
        observer.next({ success: true });
        observer.complete();
      })
      .catch((err) => observer.error(err));
  }).pipe(
    retry({ count: 2, delay: 1000 }),
    catchError((err) => {
      console.error('Failed to save progress:', err);
      return of({ success: false, error: err.message as string });
    })
  );
}

/**
 * Creates a debounced auto-save stream
 * - Debounces input by 500ms
 * - Only saves if value actually changed
 * - Cancels previous in-flight requests
 * - Retries failed requests up to 3 times
 */
export function createAutoSaveStream(
  answerChange$: Subject<AnswerChange>
): Observable<SaveResult> {
  return answerChange$.pipe(
    // Debounce to avoid excessive API calls
    debounceTime(500),
    // Only proceed if the value actually changed
    distinctUntilChanged(
      (prev, curr) =>
        prev.questionId === curr.questionId &&
        JSON.stringify(prev.answer) === JSON.stringify(curr.answer)
    ),
    // Static mode can save even while offline because it writes to localStorage.
    filter(() => STATIC_MODE || navigator.onLine),
    // Cancel previous request if a new one comes in
    switchMap((data) =>
      saveAnswer(data).pipe(
        // Retry up to 3 times with 1 second delay
        retry({ count: 3, delay: 1000 }),
        // Log successful saves
        tap(() => console.log(`Saved answer for question ${data.questionId}`)),
        // Handle errors gracefully
        catchError((err) => {
          console.error(`Failed to save answer for question ${data.questionId}:`, err);
          return of({ success: false, error: err.message });
        })
      )
    )
  );
}

/**
 * Creates a queue for offline saves
 */
export class OfflineSaveQueue {
  private queue: AnswerChange[] = [];
  private processing = false;

  add(change: AnswerChange): void {
    this.queue.push(change);
    console.log(`Queued answer for question ${change.questionId} (offline)`);
  }

  processQueue(): Observable<SaveResult[]> {
    if (this.processing || this.queue.length === 0) {
      return of([]);
    }

    this.processing = true;
    const queueCopy = [...this.queue];
    this.queue = [];

    console.log(`Processing ${queueCopy.length} queued answers...`);

    return new Observable<SaveResult[]>((observer) => {
      Promise.all(
        queueCopy.map((change) =>
          saveAnswer(change)
            .pipe(
              retry({ count: 3, delay: 1000 }),
              catchError((err) => of({ success: false, error: err.message }))
            )
            .toPromise()
        )
      )
        .then((results) => {
          this.processing = false;
          observer.next(results.filter((r): r is SaveResult => r !== undefined));
          observer.complete();
        })
        .catch((err) => {
          this.processing = false;
          observer.error(err);
        });
    });
  }

  getQueueSize(): number {
    return this.queue.length;
  }
}

// ── Analytics services ─────────────────────────────────────────────────────────

export async function fetchAnalyticsHealth(): Promise<AnalyticsHealthResponse> {
  if (STATIC_MODE) {
    const store = loadStaticStore();
    const completedCount = Object.values(store.submissions).filter((s) => s.completed).length;
    const answersCount = Object.values(store.submissions)
      .filter((s) => s.completed)
      .reduce((sum, submission) => sum + Object.keys(submission.answers || {}).length, 0);

    return {
      duckdbPath: 'localStorage',
      targetCatalog: 'static',
      motherduckConfigured: false,
      quackRequested: false,
      counts: {
        completed_submissions: completedCount,
        completed_answers: answersCount,
      },
      lastRun: {
        run_id: 'static-mode',
        completed_at: nowIso(),
        extracted_submissions: completedCount,
        loaded_submissions: completedCount,
        loaded_answers: answersCount,
        status: 'success',
        message: 'Static mode analytics are computed in-browser from localStorage.',
      },
    };
  }

  const response = await fetch(`${API_URL}/analytics/health`);
  if (!response.ok) {
    throw new Error(`Failed to fetch analytics health (${response.status})`);
  }
  return response.json() as Promise<AnalyticsHealthResponse>;
}

export async function fetchAnalyticsKpis(): Promise<AnalyticsKpiSnapshot> {
  if (STATIC_MODE) {
    const store = loadStaticStore();
    return computeStaticKpis(store);
  }

  const response = await fetch(`${API_URL}/analytics/kpis`);
  if (!response.ok) {
    throw new Error(`Failed to fetch analytics KPIs (${response.status})`);
  }
  return response.json() as Promise<AnalyticsKpiSnapshot>;
}

export async function refreshAnalytics(): Promise<AnalyticsRefreshResult> {
  if (STATIC_MODE) {
    const store = loadStaticStore();
    const completedCount = Object.values(store.submissions).filter((s) => s.completed).length;
    const answersCount = Object.values(store.submissions)
      .filter((s) => s.completed)
      .reduce((sum, submission) => sum + Object.keys(submission.answers || {}).length, 0);

    return {
      success: true,
      summary: {
        extractedSubmissions: completedCount,
        loadedSubmissions: completedCount,
        loadedAnswers: answersCount,
        wideColumns: 0,
        targetCatalog: 'static',
      },
    };
  }

  const response = await fetch(`${API_URL}/analytics/refresh`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh analytics (${response.status})`);
  }

  return response.json() as Promise<AnalyticsRefreshResult>;
}
