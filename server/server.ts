import express, { Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initDb } from './db.js';
import {
  saveResponse,
  createSubmission,
  markSubmissionComplete,
  saveSubmissionProgress,
  getSubmission,
  getAllSubmissions,
  issueResumeToken,
  consumeResumeToken,
  updateResumeTokenMetadata,
  runDataRetentionSweep,
} from './database.js';
import { validateAnswer } from './answerValidator.js';
import {
  initAnalyticsStore,
  syncCompletedSurveyDataframe,
  getCompletedSurveyDataframe,
  getAnalyticsHealth,
  getAnalyticsKpiSnapshot,
} from './analytics.js';
import { sendResumeTokenEmail } from './email.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, '').toLowerCase();
}

function getAllowedOrigins(): Set<string> {
  const configured = process.env.CORS_ALLOWED_ORIGINS
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  if (configured && configured.length > 0) {
    return new Set(configured);
  }

  return new Set(DEFAULT_ALLOWED_ORIGINS.map(normalizeOrigin));
}

interface ServerDeps {
  createSubmission: typeof createSubmission;
  saveResponse: typeof saveResponse;
  validateAnswer: typeof validateAnswer;
  saveSubmissionProgress: typeof saveSubmissionProgress;
  markSubmissionComplete: typeof markSubmissionComplete;
  syncCompletedSurveyDataframe: typeof syncCompletedSurveyDataframe;
  getSubmission: typeof getSubmission;
  getAllSubmissions: typeof getAllSubmissions;
  issueResumeToken: typeof issueResumeToken;
  updateResumeTokenMetadata: typeof updateResumeTokenMetadata;
  sendResumeTokenEmail: typeof sendResumeTokenEmail;
  consumeResumeToken: typeof consumeResumeToken;
  getAnalyticsHealth: typeof getAnalyticsHealth;
  getCompletedSurveyDataframe: typeof getCompletedSurveyDataframe;
  getAnalyticsKpiSnapshot: typeof getAnalyticsKpiSnapshot;
}

const defaultDeps: ServerDeps = {
  createSubmission,
  saveResponse,
  validateAnswer,
  saveSubmissionProgress,
  markSubmissionComplete,
  syncCompletedSurveyDataframe,
  getSubmission,
  getAllSubmissions,
  issueResumeToken,
  updateResumeTokenMetadata,
  sendResumeTokenEmail,
  consumeResumeToken,
  getAnalyticsHealth,
  getCompletedSurveyDataframe,
  getAnalyticsKpiSnapshot,
};

const PORT = process.env.PORT || 3001;
// Optional API base path to support subfolder hosting (e.g., '/survey')
const API_BASE = process.env.API_BASE || '';
const API_BODY_LIMIT = process.env.API_BODY_LIMIT || '64kb';
const API_RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const API_RATE_LIMIT_MAX = parsePositiveInt(process.env.API_RATE_LIMIT_MAX, 300);
const INCOMPLETE_PURGE_DAYS = parsePositiveInt(process.env.INCOMPLETE_PURGE_DAYS, 7);
const COMPLETED_ARCHIVE_DAYS = parsePositiveInt(process.env.COMPLETED_ARCHIVE_DAYS, 365);
const RETENTION_SWEEP_INTERVAL_MS = parsePositiveInt(process.env.RETENTION_SWEEP_INTERVAL_MS, 6 * 60 * 60 * 1000);
const ALLOWED_ORIGINS = getAllowedOrigins();

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow same-origin or non-browser requests (no Origin header).
    if (!origin) {
      callback(null, true);
      return;
    }

    if (ALLOWED_ORIGINS.has(normalizeOrigin(origin))) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin is not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const apiRateLimiter = rateLimit({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  max: API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: {
    error: 'Too many requests from this client. Please try again later.',
  },
});

export function createApp(deps: ServerDeps = defaultDeps): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: API_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: API_BODY_LIMIT }));
  app.use(`${API_BASE}/api`, apiRateLimiter);

// Create a new submission
// Accepts optional `surveyVersion` to tag which survey data file this belongs to.
app.post(`${API_BASE}/api/submissions`, (req: Request, res: Response): void => {
  try {
    const { submissionId, surveyVersion } = req.body;
    if (typeof submissionId !== 'string' || !/^[\w-]{1,128}$/.test(submissionId)) {
      res.status(400).json({ error: 'Invalid submissionId' });
      return;
    }
    if (surveyVersion !== undefined && typeof surveyVersion !== 'string') {
      res.status(400).json({ error: 'surveyVersion must be a string' });
      return;
    }
    deps.createSubmission(submissionId, surveyVersion ?? 'default');
    res.json({ success: true, submissionId });
  } catch (error) {
    console.error('Error creating submission:', error);
    res.status(500).json({ error: 'Failed to create submission' });
  }
});

// Save individual answer
app.post(`${API_BASE}/api/answers`, (req: Request, res: Response): void => {
  try {
    const { submissionId, questionId, answer } = req.body;

    if (typeof submissionId !== 'string' || !/^[\w-]{1,128}$/.test(submissionId)) {
      res.status(400).json({ error: 'Invalid submissionId' });
      return;
    }
    if (questionId === undefined || questionId === null) {
      res.status(400).json({ error: 'questionId is required' });
      return;
    }

    const validation = deps.validateAnswer(questionId, answer);
    if (!validation.valid) {
      res.status(400).json({ error: validation.reason });
      return;
    }

    deps.saveResponse(submissionId, String(questionId), validation.sanitized);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving answer:', error);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

// Save section-level progress (server-side; supplements localStorage)
app.put(`${API_BASE}/api/submissions/:submissionId/progress`, (req: Request, res: Response): void => {
  try {
    const { submissionId } = req.params;
    const { currentSectionIndex, lastQuestionId } = req.body;
    if (typeof currentSectionIndex !== 'number') {
      res.status(400).json({ error: 'currentSectionIndex must be a number' });
      return;
    }
    deps.saveSubmissionProgress(submissionId, currentSectionIndex, lastQuestionId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving progress:', error);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// Submit (complete) survey
app.post(`${API_BASE}/api/submissions/:submissionId/complete`, async (req: Request, res: Response): Promise<void> => {
  try {
    const { submissionId } = req.params;
    await deps.markSubmissionComplete(submissionId);
    await deps.syncCompletedSurveyDataframe();
    res.json({ success: true });
  } catch (error) {
    console.error('Error completing submission:', error);
    res.status(500).json({ error: 'Failed to complete submission' });
  }
});

// Get a specific submission
app.get(`${API_BASE}/api/submissions/:submissionId`, async (req: Request, res: Response): Promise<void> => {
  try {
    const { submissionId } = req.params;
    const submission = await deps.getSubmission(submissionId);
    if (!submission) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }
    res.json(submission);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// Get all submissions (for analysis)
app.get(`${API_BASE}/api/submissions`, async (req: Request, res: Response): Promise<void> => {
  try {
    const submissions = await deps.getAllSubmissions();
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Export data for analysis (CSV format)
app.get(`${API_BASE}/api/export/csv`, async (req: Request, res: Response): Promise<void> => {
  try {
    const submissions = await deps.getAllSubmissions();
    // Simple CSV export - can be enhanced
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=survey_responses.csv');
    
    let csv = 'Submission ID,Created At,Completed\n';
    submissions.forEach(sub => {
      csv += `${sub.submission_id},${sub.created_at},${sub.completed}\n`;
    });
    
    res.send(csv);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// ── Token endpoints ────────────────────────────────────────────────────────────────

/**
 * Issue a resume token that carries a user from their current submission to a
 * specific version and section of the survey.
 *
 * Body: { sourceSubmissionId, targetSurveyVersion, targetSectionIndex, resumeEmail? }
 */
app.post(`${API_BASE}/api/tokens/issue`, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceSubmissionId, targetSurveyVersion, targetSectionIndex, resumeEmail } = req.body;

    if (!sourceSubmissionId || typeof sourceSubmissionId !== 'string') {
      res.status(400).json({ error: 'sourceSubmissionId is required' });
      return;
    }

    const normalizedEmail =
      typeof resumeEmail === 'string' && resumeEmail.trim() !== ''
        ? resumeEmail.trim().toLowerCase()
        : undefined;

    if (normalizedEmail && !EMAIL_REGEX.test(normalizedEmail)) {
      res.status(400).json({ error: 'resumeEmail must be a valid email address' });
      return;
    }

    const result = await deps.issueResumeToken(
      sourceSubmissionId,
      targetSurveyVersion ?? 'default',
      typeof targetSectionIndex === 'number' ? targetSectionIndex : 0,
      {
        requestedEmail: normalizedEmail,
        emailDeliveryStatus: normalizedEmail ? 'failed' : 'not_requested',
      },
    );

    let emailDeliveryStatus: 'not_requested' | 'sent' | 'failed' = normalizedEmail ? 'failed' : 'not_requested';
    let emailDeliveryError: string | undefined;

    if (normalizedEmail) {
      const resumeLink = `${req.protocol}://${req.get('host')}${result.resumeUrl}`;
      const emailResult = await deps.sendResumeTokenEmail(
        normalizedEmail,
        result.token,
        resumeLink,
        result.expiresAt,
      );

      emailDeliveryStatus = emailResult.sent ? 'sent' : 'failed';
      emailDeliveryError = emailResult.error;

      await deps.updateResumeTokenMetadata(result.token, {
        requestedEmail: normalizedEmail,
        emailDeliveryStatus,
        emailDeliveryError,
        emailSentAt: emailResult.sent ? new Date().toISOString() : undefined,
      });
    }

    res.json({
      success: true,
      ...result,
      ttlDays: 7,
      emailDeliveryStatus,
      emailDeliveryError,
    });
  } catch (error) {
    console.error('Error issuing token:', error);
    res.status(500).json({ error: 'Failed to issue token' });
  }
});

/**
 * Consume a resume token.
 * Returns the resume context on success; a generic error on any failure so
 * callers cannot distinguish between "bad token" and "already used".
 *
 * Body: { token }
 */
app.post(`${API_BASE}/api/tokens/consume`, async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, reason: 'invalid' });
      return;
    }

    const context = await deps.consumeResumeToken(token);

    if (!context) {
      // Return a generic 200 (not 401/403) to avoid leaking token state
      res.json({ success: false, reason: 'invalid' });
      return;
    }

    res.json({ success: true, context });
  } catch (error) {
    console.error('Error consuming token:', error);
    res.status(500).json({ success: false, reason: 'error' });
  }
});

// ── Analytics endpoints (DuckDB/MotherDuck) ───────────────────────────────────

app.get(`${API_BASE}/api/analytics/health`, async (_req: Request, res: Response): Promise<void> => {
  try {
    const health = await deps.getAnalyticsHealth();
    res.json(health);
  } catch (error) {
    console.error('Error fetching analytics health:', error);
    res.status(500).json({ error: 'Failed to fetch analytics health' });
  }
});

app.get(`${API_BASE}/api/analytics/completed-surveys`, async (req: Request, res: Response): Promise<void> => {
  try {
    const rawLimit = Number(req.query.limit ?? 250);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 250;
    const rows = await deps.getCompletedSurveyDataframe(limit);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching analytics dataframe:', error);
    res.status(500).json({ error: 'Failed to fetch analytics dataframe' });
  }
});

app.get(`${API_BASE}/api/analytics/kpis`, async (_req: Request, res: Response): Promise<void> => {
  try {
    const snapshot = await deps.getAnalyticsKpiSnapshot();
    res.json(snapshot);
  } catch (error) {
    console.error('Error fetching analytics KPIs:', error);
    res.status(500).json({ error: 'Failed to fetch analytics KPIs' });
  }
});

app.post(`${API_BASE}/api/analytics/refresh`, async (_req: Request, res: Response): Promise<void> => {
  try {
    const summary = await deps.syncCompletedSurveyDataframe();
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error refreshing analytics dataframe:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh analytics dataframe' });
  }
});

  app.use((err: Error, _req: Request, res: Response, next: express.NextFunction) => {
    if (err.message === 'Origin is not allowed by CORS') {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
    next(err);
  });

  return app;
}

// ── Startup ──────────────────────────────────────────────────────────────────────

export async function startServer(): Promise<void> {
  await initDb();
  await initAnalyticsStore();

  const startupRetention = await runDataRetentionSweep({
    incompletePurgeDays: INCOMPLETE_PURGE_DAYS,
    completedArchiveDays: COMPLETED_ARCHIVE_DAYS,
  });
  console.log('[retention] Startup sweep summary:', startupRetention);

  await syncCompletedSurveyDataframe();

  setInterval(async () => {
    try {
      const summary = await runDataRetentionSweep({
        incompletePurgeDays: INCOMPLETE_PURGE_DAYS,
        completedArchiveDays: COMPLETED_ARCHIVE_DAYS,
      });

      if (summary.purgedSubmissions > 0 || summary.archivedSubmissions > 0) {
        await syncCompletedSurveyDataframe();
      }

      console.log('[retention] Scheduled sweep summary:', summary);
    } catch (error) {
      console.error('[retention] Scheduled sweep failed:', error);
    }
  }, RETENTION_SWEEP_INTERVAL_MS);

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Survey API server running on http://localhost:${PORT}`);
  });
}

const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
if (!isTestEnv) {
  await startServer();
}
