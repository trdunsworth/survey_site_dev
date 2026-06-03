import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeToken, createSubmission, loadSubmission } from './surveyService';

interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}

function jsonResponse(body: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('surveyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('createSubmission returns success on a successful API response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await firstValueFrom(createSubmission('sub-123'));

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('createSubmission retries and returns failure payload after repeated errors', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = firstValueFrom(createSubmission('sub-999'));
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  });

  it('loadSubmission maps 404 into a failure result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'missing' }, 404));
    vi.stubGlobal('fetch', fetchMock);

    const result = await firstValueFrom(loadSubmission('missing-id'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('Submission not found');
  });

  it('consumeToken returns generic error reason when request fails', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error('timeout'));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = firstValueFrom(consumeToken('token-1'));
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: false, reason: 'error' });
  });
});
