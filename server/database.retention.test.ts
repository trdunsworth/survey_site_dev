// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeDuckDbConfig {
  purgeableSubmissionIds?: string[];
  countByPrefix?: Record<string, number>;
}

function createFakeDuckDb(config: FakeDuckDbConfig = {}) {
  const purgeableSubmissionIds = config.purgeableSubmissionIds ?? [];
  const countByPrefix = config.countByPrefix ?? {};

  const fakeQuery = vi.fn(async (sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> => {
    // Match COUNT(*) queries for retention sweep
    for (const [prefix, count] of Object.entries(countByPrefix)) {
      if (sql.includes(prefix)) {
        return [{ cnt: count }];
      }
    }

    // Match the purgeable submission IDs query
    if (sql.includes('FROM submissions s') && sql.includes('lifecycle_state')) {
      return purgeableSubmissionIds.map((id) => ({ submission_id: id }));
    }

    return [];
  });

  const fakeRun = vi.fn(async (_sql: string, _params?: unknown[]): Promise<void> => {
    // no-op for mutations
  });

  return { query: fakeQuery, run: fakeRun };
}

describe('runDataRetentionSweep', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('expires tokens, purges incomplete records, and archives aged completed submissions', async () => {
    const fakeDb = createFakeDuckDb({
      purgeableSubmissionIds: ['sub-old-a', 'sub-old-b'],
      countByPrefix: {
        "status = 'issued' AND expires_at": 2,
        'completed = TRUE': 4,
      },
    });

    vi.doMock('./duckdb', () => ({
      query: fakeDb.query,
      run: fakeDb.run,
      queryOne: vi.fn(async (sql: string, params?: unknown[]) => {
        const rows = await fakeDb.query(sql, params);
        return rows[0] ?? null;
      }),
    }));

    const { runDataRetentionSweep } = await import('./database.ts');

    const summary = await runDataRetentionSweep({
      now: new Date('2026-06-03T00:00:00.000Z'),
      incompletePurgeDays: 7,
      completedArchiveDays: 365,
    });

    expect(summary.expiredTokens).toBe(2);
    expect(summary.purgedAnswers).toBe(2);
    expect(summary.purgedTokens).toBe(2);
    expect(summary.purgedSubmissions).toBe(2);
    expect(summary.archivedSubmissions).toBe(4);
    expect(summary.incompleteCutoff).toBe('2026-05-27T00:00:00.000Z');
    expect(summary.archiveCutoff).toBe('2025-06-03T00:00:00.000Z');
  });

  it('does not purge when no retention mutations are needed', async () => {
    const fakeDb = createFakeDuckDb({
      purgeableSubmissionIds: [],
      countByPrefix: {
        "status = 'issued' AND expires_at": 0,
        'completed = TRUE': 0,
      },
    });

    vi.doMock('./duckdb', () => ({
      query: fakeDb.query,
      run: fakeDb.run,
      queryOne: vi.fn(async (sql: string, params?: unknown[]) => {
        const rows = await fakeDb.query(sql, params);
        return rows[0] ?? null;
      }),
    }));

    const { runDataRetentionSweep } = await import('./database.ts');

    const summary = await runDataRetentionSweep({
      now: new Date('2026-06-03T00:00:00.000Z'),
    });

    expect(summary.expiredTokens).toBe(0);
    expect(summary.purgedSubmissions).toBe(0);
    expect(summary.archivedSubmissions).toBe(0);
  });
});
