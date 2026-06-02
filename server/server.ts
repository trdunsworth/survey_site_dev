import express, { Request, Response } from 'express';
import cors from 'cors';
import { initDb } from './db';
import {
  saveResponse,
  createSubmission,
  markSubmissionComplete,
  saveSubmissionProgress,
  getSubmission,
  getAllSubmissions,
  issueResumeToken,
  consumeResumeToken,
} from './database';
import { validateAnswer } from './answerValidator';

const app = express();
const PORT = process.env.PORT || 3001;
// Optional API base path to support subfolder hosting (e.g., '/survey')
const API_BASE = process.env.API_BASE || '';

app.use(cors());
app.use(express.json());

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
    createSubmission(submissionId, surveyVersion ?? 'default');
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

    const validation = validateAnswer(questionId, answer);
    if (!validation.valid) {
      res.status(400).json({ error: validation.reason });
      return;
    }

    saveResponse(submissionId, String(questionId), validation.sanitized);
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
    saveSubmissionProgress(submissionId, currentSectionIndex, lastQuestionId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving progress:', error);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// Submit (complete) survey
app.post(`${API_BASE}/api/submissions/:submissionId/complete`, (req: Request, res: Response): void => {
  try {
    const { submissionId } = req.params;
    markSubmissionComplete(submissionId);
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
    const submission = await getSubmission(submissionId);
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
    const submissions = await getAllSubmissions();
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Export data for analysis (CSV format)
app.get(`${API_BASE}/api/export/csv`, async (req: Request, res: Response): Promise<void> => {
  try {
    const submissions = await getAllSubmissions();
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
 * Body: { sourceSubmissionId, targetSurveyVersion, targetSectionIndex }
 */
app.post(`${API_BASE}/api/tokens/issue`, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceSubmissionId, targetSurveyVersion, targetSectionIndex } = req.body;

    if (!sourceSubmissionId || typeof sourceSubmissionId !== 'string') {
      res.status(400).json({ error: 'sourceSubmissionId is required' });
      return;
    }

    const result = await issueResumeToken(
      sourceSubmissionId,
      targetSurveyVersion ?? 'default',
      typeof targetSectionIndex === 'number' ? targetSectionIndex : 0,
    );

    res.json({ success: true, ...result });
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

    const context = await consumeResumeToken(token);

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

// ── Startup ──────────────────────────────────────────────────────────────────────

await initDb();

app.listen(PORT, () => {
  console.log(`Survey API server running on http://localhost:${PORT}`);
});
