// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = {
  getRowObjectsJS: () => Array<Record<string, unknown>>;
};

type TestHarnessOptions = {
  motherDuckDb?: string;
  motherDuckToken?: string;
  failAttach?: boolean;
};

function createQueryResult(rows: Array<Record<string, unknown>> = []): QueryResult {
  return {
    getRowObjectsJS: () => rows,
  };
}

async function loadAnalyticsModule(options: TestHarnessOptions = {}) {
  vi.resetModules();

  if (options.motherDuckDb) {
    process.env.MOTHERDUCK_DB = options.motherDuckDb;
  } else {
    delete process.env.MOTHERDUCK_DB;
  }

  if (options.motherDuckToken) {
    process.env.MOTHERDUCK_TOKEN = options.motherDuckToken;
  } else {
    delete process.env.MOTHERDUCK_TOKEN;
  }

  process.env.DUCKDB_LOAD_QUACK = 'false';

  const executedSql: string[] = [];

  const connection = {
    run: vi.fn(async (sql: string) => {
      executedSql.push(sql);

      if (options.failAttach && sql.startsWith('ATTACH ')) {
        throw new Error('attach failed');
      }
    }),
    runAndReadAll: vi.fn(async (sql: string) => {
      executedSql.push(sql);

      if (sql.includes('COUNT(*) AS completed_submissions')) {
        return createQueryResult([
          {
            completed_submissions: 0,
            completed_answers: 0,
          },
        ]);
      }

      if (sql.includes('FROM') && sql.includes('elt_runs')) {
        return createQueryResult([]);
      }

      return createQueryResult([]);
    }),
  };

  vi.doMock('@duckdb/node-api', () => ({
    DuckDBConnection: class MockDuckDBConnection {},
    DuckDBInstance: {
      create: vi.fn(async () => ({
        connect: vi.fn(async () => connection),
      })),
    },
  }));

  vi.doMock('./database', () => ({
    getCompletedSubmissionsWithAnswers: vi.fn(async () => []),
  }));

  const analytics = await import('./analytics.ts');

  await analytics.initAnalyticsStore();

  return {
    analytics,
    executedSql,
  };
}

describe('analytics table qualification', () => {
  const envSnapshot = {
    motherDuckDb: process.env.MOTHERDUCK_DB,
    motherDuckToken: process.env.MOTHERDUCK_TOKEN,
    duckdbLoadQuack: process.env.DUCKDB_LOAD_QUACK,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (envSnapshot.motherDuckDb === undefined) {
      delete process.env.MOTHERDUCK_DB;
    } else {
      process.env.MOTHERDUCK_DB = envSnapshot.motherDuckDb;
    }

    if (envSnapshot.motherDuckToken === undefined) {
      delete process.env.MOTHERDUCK_TOKEN;
    } else {
      process.env.MOTHERDUCK_TOKEN = envSnapshot.motherDuckToken;
    }

    if (envSnapshot.duckdbLoadQuack === undefined) {
      delete process.env.DUCKDB_LOAD_QUACK;
    } else {
      process.env.DUCKDB_LOAD_QUACK = envSnapshot.duckdbLoadQuack;
    }
  });

  it('uses schema-qualified table names for local DuckDB', async () => {
    const { executedSql } = await loadAnalyticsModule();

    const createCompletedSubmissions = executedSql.find((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS') && sql.includes('completed_submissions'),
    );

    expect(createCompletedSubmissions).toBeDefined();
    expect(createCompletedSubmissions).toContain('"main"."completed_submissions"');
    expect(createCompletedSubmissions).not.toContain('"main"."main"."completed_submissions"');
  });

  it('uses catalog-qualified table names when MotherDuck is attached', async () => {
    const { executedSql } = await loadAnalyticsModule({ motherDuckDb: 'survey_prod' });

    const attachSql = executedSql.find((sql) => sql.startsWith('ATTACH '));
    const createCompletedSubmissions = executedSql.find((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS') && sql.includes('completed_submissions'),
    );

    expect(attachSql).toContain("ATTACH 'md:survey_prod' AS md");
    expect(createCompletedSubmissions).toContain('"md"."main"."completed_submissions"');
  });

  it('falls back to local table qualification when MotherDuck attach fails', async () => {
    const { analytics, executedSql } = await loadAnalyticsModule({
      motherDuckDb: 'survey_prod',
      failAttach: true,
    });

    const createCompletedSubmissions = executedSql.find((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS') && sql.includes('completed_submissions'),
    );

    expect(createCompletedSubmissions).toContain('"main"."completed_submissions"');
    expect(createCompletedSubmissions).not.toContain('"md"."main"."completed_submissions"');

    const health = await analytics.getAnalyticsHealth();
    expect(health.targetCatalog).toBe('local');
  });
});
