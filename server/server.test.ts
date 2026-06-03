// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './server.ts';

function createDeps() {
  return {
    createSubmission: vi.fn(async () => undefined),
    saveResponse: vi.fn(async () => undefined),
    validateAnswer: vi.fn(() => ({ valid: true, sanitized: 'ok' })),
    saveSubmissionProgress: vi.fn(async () => undefined),
    markSubmissionComplete: vi.fn(async () => undefined),
    syncCompletedSurveyDataframe: vi.fn(async () => ({
      extractedSubmissions: 0,
      loadedSubmissions: 0,
      loadedAnswers: 0,
      wideColumns: 0,
      targetCatalog: 'main',
    })),
    getSubmission: vi.fn(async () => null),
    getAllSubmissions: vi.fn(async () => []),
    issueResumeToken: vi.fn(async () => ({ token: 't1', expiresAt: '2026-01-01T00:00:00.000Z', resumeUrl: '/?t=t1' })),
    updateResumeTokenMetadata: vi.fn(async () => undefined),
    sendResumeTokenEmail: vi.fn(async () => ({ sent: true })),
    consumeResumeToken: vi.fn(async () => null),
    getAnalyticsHealth: vi.fn(async () => ({ targetCatalog: 'main' })),
    getCompletedSurveyDataframe: vi.fn(async () => []),
    getAnalyticsKpiSnapshot: vi.fn(async () => ({ overview: {}, dailyCompletions30d: [], questionCompletion: [], answerTypeMix: [] })),
  };
}

describe('server API routes', () => {
  it('rejects invalid submission id', async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/submissions')
      .send({ submissionId: '' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid submissionId' });
    expect(deps.createSubmission).not.toHaveBeenCalled();
  });

  it('creates submission for valid request', async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/submissions')
      .send({ submissionId: 'sub-123', surveyVersion: 'default' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, submissionId: 'sub-123' });
    expect(deps.createSubmission).toHaveBeenCalledWith('sub-123', 'default');
  });

  it('rejects invalid answers from validator', async () => {
    const deps = createDeps();
    deps.validateAnswer.mockReturnValueOnce({ valid: false, reason: 'bad value' });
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/answers')
      .send({ submissionId: 'sub-123', questionId: '1', answer: 'bad' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'bad value' });
    expect(deps.saveResponse).not.toHaveBeenCalled();
  });

  it('persists sanitized answer when validator succeeds', async () => {
    const deps = createDeps();
    deps.validateAnswer.mockReturnValueOnce({ valid: true, sanitized: 'clean' });
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/answers')
      .send({ submissionId: 'sub-123', questionId: '7', answer: '<b>x</b>' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(deps.saveResponse).toHaveBeenCalledWith('sub-123', '7', 'clean');
  });

  it('returns invalid result for missing token body', async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/tokens/consume')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, reason: 'invalid' });
  });

  it('returns success with context for a valid token', async () => {
    const deps = createDeps();
    deps.consumeResumeToken.mockResolvedValueOnce({
      sourceSubmissionId: 'sub-1',
      targetSurveyVersion: 'default',
      targetSectionIndex: 1,
    });
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/tokens/consume')
      .send({ token: 'abc' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      context: {
        sourceSubmissionId: 'sub-1',
        targetSurveyVersion: 'default',
        targetSectionIndex: 1,
      },
    });
  });

  it('returns generic invalid response when token cannot be consumed', async () => {
    const deps = createDeps();
    deps.consumeResumeToken.mockResolvedValueOnce(null);
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/tokens/consume')
      .send({ token: 'expired-or-used' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: false, reason: 'invalid' });
  });

  it('rejects invalid resume email on token issue', async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/tokens/issue')
      .send({
        sourceSubmissionId: 'sub-1',
        targetSurveyVersion: 'default',
        targetSectionIndex: 1,
        resumeEmail: 'not-an-email',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'resumeEmail must be a valid email address' });
    expect(deps.issueResumeToken).not.toHaveBeenCalled();
  });

  it('issues token and attempts email when resume email is supplied', async () => {
    const deps = createDeps();
    deps.sendResumeTokenEmail.mockResolvedValueOnce({ sent: true });
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/tokens/issue')
      .send({
        sourceSubmissionId: 'sub-1',
        targetSurveyVersion: 'default',
        targetSectionIndex: 1,
        resumeEmail: 'USER@Example.com',
      });

    expect(response.status).toBe(200);
    expect(deps.issueResumeToken).toHaveBeenCalledWith(
      'sub-1',
      'default',
      1,
      expect.objectContaining({ requestedEmail: 'user@example.com' }),
    );
    expect(deps.sendResumeTokenEmail).toHaveBeenCalledWith(
      'user@example.com',
      't1',
      expect.stringContaining('/?t=t1'),
      '2026-01-01T00:00:00.000Z',
    );
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        ttlDays: 7,
        emailDeliveryStatus: 'sent',
      }),
    );
  });

  it('rejects non-numeric section progress payloads', async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const response = await request(app)
      .put('/api/submissions/sub-123/progress')
      .send({ currentSectionIndex: '2' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'currentSectionIndex must be a number' });
    expect(deps.saveSubmissionProgress).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown submissions', async () => {
    const deps = createDeps();
    deps.getSubmission.mockResolvedValueOnce(null);
    const app = createApp(deps);

    const response = await request(app).get('/api/submissions/missing-sub');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Submission not found' });
  });

  it('passes numeric limit to completed-surveys analytics query', async () => {
    const deps = createDeps();
    deps.getCompletedSurveyDataframe.mockResolvedValueOnce([{ submission_id: 'sub-1' }]);
    const app = createApp(deps);

    const response = await request(app).get('/api/analytics/completed-surveys?limit=10');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ submission_id: 'sub-1' }]);
    expect(deps.getCompletedSurveyDataframe).toHaveBeenCalledWith(10);
  });

  it('falls back to default limit when completed-surveys limit is invalid', async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const response = await request(app).get('/api/analytics/completed-surveys?limit=not-a-number');

    expect(response.status).toBe(200);
    expect(deps.getCompletedSurveyDataframe).toHaveBeenCalledWith(250);
  });

  it('refreshes analytics dataframe and returns summary', async () => {
    const deps = createDeps();
    deps.syncCompletedSurveyDataframe.mockResolvedValueOnce({
      extractedSubmissions: 3,
      loadedSubmissions: 3,
      loadedAnswers: 18,
      wideColumns: 7,
      targetCatalog: 'local',
    });
    const app = createApp(deps);

    const response = await request(app).post('/api/analytics/refresh').send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      summary: {
        extractedSubmissions: 3,
        loadedSubmissions: 3,
        loadedAnswers: 18,
        wideColumns: 7,
        targetCatalog: 'local',
      },
    });
  });

  it('rejects disallowed CORS origin', async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/submissions')
      .set('Origin', 'https://evil.example.com')
      .send({ submissionId: 'sub-123', surveyVersion: 'default' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Origin not allowed' });
  });

  it('does not expose x-powered-by header', async () => {
    const deps = createDeps();
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/submissions')
      .send({ submissionId: 'sub-123', surveyVersion: 'default' });

    expect(response.status).toBe(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
