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
  AnalyticsHealthResponse,
  AnalyticsKpiSnapshot,
  AnalyticsRefreshResult,
} from '../types';

// Frontend API base URL is configurable via Vite env
// Defaults to '/api' so it can be reverse-proxied under the site
const API_URL = (import.meta as any).env?.VITE_API_URL ?? '/api';

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
  resumeEmail?: string,
): Observable<TokenIssueResult> {
  return new Observable<TokenIssueResult>((observer) => {
    fetch(`${API_URL}/tokens/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceSubmissionId, targetSurveyVersion, targetSectionIndex, resumeEmail }),
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
    // Only save when online
    filter(() => navigator.onLine),
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
  const response = await fetch(`${API_URL}/analytics/health`);
  if (!response.ok) {
    throw new Error(`Failed to fetch analytics health (${response.status})`);
  }
  return response.json() as Promise<AnalyticsHealthResponse>;
}

export async function fetchAnalyticsKpis(): Promise<AnalyticsKpiSnapshot> {
  const response = await fetch(`${API_URL}/analytics/kpis`);
  if (!response.ok) {
    throw new Error(`Failed to fetch analytics KPIs (${response.status})`);
  }
  return response.json() as Promise<AnalyticsKpiSnapshot>;
}

export async function refreshAnalytics(): Promise<AnalyticsRefreshResult> {
  const response = await fetch(`${API_URL}/analytics/refresh`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh analytics (${response.status})`);
  }

  return response.json() as Promise<AnalyticsRefreshResult>;
}
