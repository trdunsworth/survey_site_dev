// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
function createFakeDb(config = {}) {
    const purgeableSubmissionIds = config.purgeableSubmissionIds ?? [];
    const rowsModifiedByPrefix = config.rowsModifiedByPrefix ?? {};
    let lastRowsModified = 0;
    const db = {
        run: vi.fn((sql) => {
            const match = Object.entries(rowsModifiedByPrefix).find(([prefix]) => sql.includes(prefix));
            lastRowsModified = match ? match[1] : 0;
        }),
        prepare: vi.fn((sql) => {
            if (sql.includes('FROM submissions s')) {
                let index = -1;
                return {
                    bind: vi.fn(),
                    step: () => {
                        index += 1;
                        return index < purgeableSubmissionIds.length;
                    },
                    getAsObject: () => ({ submission_id: purgeableSubmissionIds[index] }),
                    free: vi.fn(),
                };
            }
            return {
                bind: vi.fn(),
                step: () => false,
                getAsObject: () => ({}),
                free: vi.fn(),
            };
        }),
        getRowsModified: vi.fn(() => lastRowsModified),
    };
    return db;
}
describe('runDataRetentionSweep', () => {
    beforeEach(() => {
        vi.resetModules();
    });
    it('expires tokens, purges incomplete records, and archives aged completed submissions', async () => {
        const fakeDb = createFakeDb({
            purgeableSubmissionIds: ['sub-old-a', 'sub-old-b'],
            rowsModifiedByPrefix: {
                "SET status = 'expired'": 2,
                'DELETE FROM answers': 8,
                'DELETE FROM resume_tokens': 3,
                'DELETE FROM submissions': 2,
                "SET lifecycle_state = 'archived'": 4,
            },
        });
        const persistMock = vi.fn();
        vi.doMock('./db', () => ({
            getDb: () => fakeDb,
            persist: persistMock,
        }));
        const { runDataRetentionSweep } = await import('./database.ts');
        const summary = await runDataRetentionSweep({
            now: new Date('2026-06-03T00:00:00.000Z'),
            incompletePurgeDays: 7,
            completedArchiveDays: 365,
        });
        expect(summary.expiredTokens).toBe(2);
        expect(summary.purgedAnswers).toBe(8);
        expect(summary.purgedTokens).toBe(3);
        expect(summary.purgedSubmissions).toBe(2);
        expect(summary.archivedSubmissions).toBe(4);
        expect(summary.incompleteCutoff).toBe('2026-05-27T00:00:00.000Z');
        expect(summary.archiveCutoff).toBe('2025-06-03T00:00:00.000Z');
        expect(persistMock).toHaveBeenCalledTimes(1);
    });
    it('does not persist when no retention mutations are needed', async () => {
        const fakeDb = createFakeDb({
            purgeableSubmissionIds: [],
            rowsModifiedByPrefix: {
                "SET status = 'expired'": 0,
                "SET lifecycle_state = 'archived'": 0,
            },
        });
        const persistMock = vi.fn();
        vi.doMock('./db', () => ({
            getDb: () => fakeDb,
            persist: persistMock,
        }));
        const { runDataRetentionSweep } = await import('./database.ts');
        const summary = await runDataRetentionSweep({
            now: new Date('2026-06-03T00:00:00.000Z'),
        });
        expect(summary.expiredTokens).toBe(0);
        expect(summary.purgedSubmissions).toBe(0);
        expect(summary.archivedSubmissions).toBe(0);
        expect(persistMock).not.toHaveBeenCalled();
    });
});
