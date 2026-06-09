import path from 'path';
import { fileURLToPath } from 'url';
import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { getCompletedSubmissionsWithAnswers } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DUCKDB_PATH = process.env.DUCKDB_PATH ?? path.join(__dirname, 'survey_analytics.duckdb');
const MOTHERDUCK_DB = process.env.MOTHERDUCK_DB;
const MOTHERDUCK_TOKEN = process.env.MOTHERDUCK_TOKEN;
const LOAD_QUACK = process.env.DUCKDB_LOAD_QUACK !== 'false';
const REQUIRE_MOTHERDUCK = process.env.ANALYTICS_REQUIRE_MOTHERDUCK === 'true';

let _conn: DuckDBConnection | null = null;
let _targetCatalog = 'local';
let _motherDuckAttempted = false;
let _lastMotherDuckError: string | null = null;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function tableRef(tableName: string): string {
  if (_targetCatalog === 'md') {
    return `${quoteIdentifier('md')}.${quoteIdentifier('main')}.${quoteIdentifier(tableName)}`;
  }

  return `${quoteIdentifier('main')}.${quoteIdentifier(tableName)}`;
}

function toDataframeColumn(questionId: string): string {
  const cleaned = questionId.replace(/[^a-zA-Z0-9_]/g, '_');
  return `q_${cleaned}`;
}

function getConnection(): DuckDBConnection {
  if (!_conn) {
    throw new Error('[analytics] DuckDB connection is not initialized. Call initAnalyticsStore() first.');
  }
  return _conn;
}

async function loadExtensionBestEffort(connection: DuckDBConnection, extensionName: string): Promise<boolean> {
  try {
    await connection.run(`INSTALL ${extensionName}`);
    await connection.run(`LOAD ${extensionName}`);
    return true;
  } catch (error) {
    console.warn(`[analytics] Failed to load extension '${extensionName}':`, error);
    return false;
  }
}

async function ensureAnalyticsObjects(connection: DuckDBConnection): Promise<void> {
  await connection.run(
    `CREATE TABLE IF NOT EXISTS ${tableRef('completed_submissions')} (
      submission_id VARCHAR PRIMARY KEY,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      completed_at TIMESTAMP,
      survey_version VARCHAR,
      current_section_index INTEGER,
      last_question_id VARCHAR,
      answers_json JSON,
      synced_at TIMESTAMP
    )`,
  );

  await connection.run(
    `CREATE TABLE IF NOT EXISTS ${tableRef('completed_answers_long')} (
      submission_id VARCHAR,
      question_id VARCHAR,
      answer_json JSON,
      answer_type VARCHAR,
      synced_at TIMESTAMP
    )`,
  );

  await connection.run(
    `CREATE TABLE IF NOT EXISTS ${tableRef('elt_runs')} (
      run_id VARCHAR,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      extracted_submissions INTEGER,
      loaded_submissions INTEGER,
      loaded_answers INTEGER,
      status VARCHAR,
      message VARCHAR
    )`,
  );

  await connection.run(
    `CREATE OR REPLACE VIEW ${tableRef('completed_surveys_dataframe_long')} AS
     SELECT
       s.submission_id,
       s.created_at,
       s.updated_at,
       s.completed_at,
       s.survey_version,
       s.current_section_index,
       s.last_question_id,
       a.question_id,
       a.answer_json,
       a.answer_type
     FROM ${tableRef('completed_submissions')} s
     LEFT JOIN ${tableRef('completed_answers_long')} a
       ON s.submission_id = a.submission_id`,
  );
}

async function ensureCuratedKpiViews(connection: DuckDBConnection): Promise<void> {
  await connection.run(
    `CREATE OR REPLACE VIEW ${tableRef('kpi_overview')} AS
     WITH answers_per_submission AS (
       SELECT submission_id, COUNT(*) AS answered_questions
       FROM ${tableRef('completed_answers_long')}
       GROUP BY submission_id
     )
     SELECT
       COUNT(*) AS total_completed_surveys,
       COUNT(DISTINCT survey_version) AS survey_versions,
       COALESCE(
         (SELECT AVG(answered_questions)::DOUBLE FROM answers_per_submission),
         0
       ) AS avg_answered_questions,
       COALESCE(
         (SELECT median(answered_questions)::DOUBLE FROM answers_per_submission),
         0
       ) AS median_answered_questions,
       COUNT(*) FILTER (
         WHERE completed_at >= (NOW() - INTERVAL '24 hours')
       ) AS completed_last_24h,
       COUNT(*) FILTER (
         WHERE completed_at >= (NOW() - INTERVAL '7 days')
       ) AS completed_last_7d
     FROM ${tableRef('completed_submissions')}`,
  );

  await connection.run(
    `CREATE OR REPLACE VIEW ${tableRef('kpi_daily_completions_30d')} AS
     SELECT
       DATE_TRUNC('day', completed_at) AS completion_day,
       COUNT(*) AS completed_surveys
     FROM ${tableRef('completed_submissions')}
     WHERE completed_at >= (NOW() - INTERVAL '30 days')
     GROUP BY 1
     ORDER BY 1`,
  );

  await connection.run(
    `CREATE OR REPLACE VIEW ${tableRef('kpi_question_completion')} AS
     WITH total AS (
       SELECT COUNT(*)::DOUBLE AS total_completed
       FROM ${tableRef('completed_submissions')}
     ),
     answered AS (
       SELECT question_id, COUNT(*)::DOUBLE AS answered_count
       FROM ${tableRef('completed_answers_long')}
       GROUP BY question_id
     )
     SELECT
       a.question_id,
       a.answered_count::BIGINT AS answered_count,
       CASE
         WHEN t.total_completed = 0 THEN 0
         ELSE ROUND((a.answered_count / t.total_completed) * 100, 2)
       END AS completion_rate_pct
     FROM answered a
     CROSS JOIN total t
     ORDER BY completion_rate_pct DESC, a.question_id ASC`,
  );

  await connection.run(
    `CREATE OR REPLACE VIEW ${tableRef('kpi_answer_type_mix')} AS
     SELECT
       answer_type,
       COUNT(*) AS answer_count,
       ROUND((COUNT(*)::DOUBLE / NULLIF(SUM(COUNT(*)) OVER (), 0)) * 100, 2) AS pct_of_answers
     FROM ${tableRef('completed_answers_long')}
     GROUP BY answer_type
     ORDER BY answer_count DESC, answer_type ASC`,
  );
}

async function attachMotherDuck(connection: DuckDBConnection): Promise<void> {
  _motherDuckAttempted = false;
  _lastMotherDuckError = null;

  if (!MOTHERDUCK_DB) {
    return;
  }

  _motherDuckAttempted = true;

  if (!MOTHERDUCK_TOKEN) {
    _lastMotherDuckError = 'MOTHERDUCK_TOKEN is not set';
    return;
  }

  const loaded = await loadExtensionBestEffort(connection, 'motherduck');
  if (!loaded) {
    _lastMotherDuckError = 'Failed to load motherduck extension';
    return;
  }

  const mdUri = MOTHERDUCK_TOKEN
    ? `md:${MOTHERDUCK_DB}?motherduck_token=${encodeURIComponent(MOTHERDUCK_TOKEN)}`
    : `md:${MOTHERDUCK_DB}`;

  try {
    await connection.run(`ATTACH '${escapeSqlLiteral(mdUri)}' AS md`);
    _targetCatalog = 'md';
    _lastMotherDuckError = null;
    console.log(`[analytics] Connected to MotherDuck database '${MOTHERDUCK_DB}'`);
  } catch (error) {
    _targetCatalog = 'local';
    _lastMotherDuckError = error instanceof Error ? error.message : 'Unknown MotherDuck attach error';
    throw error;
  }
}

function answerType(answer: unknown): string {
  if (Array.isArray(answer)) return 'array';
  if (answer === null) return 'null';
  return typeof answer;
}

export async function initAnalyticsStore(): Promise<void> {
  const instance = await DuckDBInstance.create(DUCKDB_PATH);
  const connection = await instance.connect();

  _conn = connection;

  await connection.run('PRAGMA threads=4');

  if (LOAD_QUACK) {
    await loadExtensionBestEffort(connection, 'quack');
  }

  try {
    await attachMotherDuck(connection);
  } catch (error) {
    _targetCatalog = 'local';
    console.warn('[analytics] MotherDuck attach failed; using local DuckDB file instead.', error);
  }

  if (REQUIRE_MOTHERDUCK && _targetCatalog !== 'md') {
    throw new Error(
      `[analytics] ANALYTICS_REQUIRE_MOTHERDUCK=true but MotherDuck is not connected${
        _lastMotherDuckError ? `: ${_lastMotherDuckError}` : ''
      }`,
    );
  }

  await ensureAnalyticsObjects(connection);
  await ensureCuratedKpiViews(connection);
  console.log(`[analytics] DuckDB analytics store ready at ${DUCKDB_PATH}`);
}

export interface EltSyncSummary {
  extractedSubmissions: number;
  loadedSubmissions: number;
  loadedAnswers: number;
  wideColumns: number;
  targetCatalog: string;
}

export interface AnalyticsKpiSnapshot {
  overview: Record<string, unknown>;
  dailyCompletions30d: Array<Record<string, unknown>>;
  questionCompletion: Array<Record<string, unknown>>;
  answerTypeMix: Array<Record<string, unknown>>;
}

export async function syncCompletedSurveyDataframe(): Promise<EltSyncSummary> {
  const connection = getConnection();
  const runId = `elt_${Date.now()}`;
  const startedAt = new Date().toISOString();

  let extractedSubmissions = 0;
  let loadedSubmissions = 0;
  let loadedAnswers = 0;
  let wideColumns = 0;
  let status = 'success';
  let message = 'ok';

  try {
    const completedSubmissions = await getCompletedSubmissionsWithAnswers();
    extractedSubmissions = completedSubmissions.length;

    const questionIds = Array.from(
      new Set(completedSubmissions.flatMap((submission) => Object.keys(submission.answers))),
    ).sort();

    const dynamicColumns = questionIds.map((questionId) => ({
      questionId,
      columnName: toDataframeColumn(questionId),
    }));

    wideColumns = dynamicColumns.length;

    await connection.run('BEGIN TRANSACTION');

    await connection.run(`DELETE FROM ${tableRef('completed_answers_long')}`);
    await connection.run(`DELETE FROM ${tableRef('completed_submissions')}`);

    for (const submission of completedSubmissions) {
      await connection.run(
        `INSERT INTO ${tableRef('completed_submissions')} (
          submission_id, created_at, updated_at, completed_at, survey_version,
          current_section_index, last_question_id, answers_json, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          submission.submission_id,
          submission.created_at,
          submission.updated_at,
          submission.updated_at,
          submission.survey_version,
          submission.current_section_index,
          submission.last_question_id,
          JSON.stringify(submission.answers),
          new Date().toISOString(),
        ],
      );
      loadedSubmissions += 1;

      for (const [questionId, answer] of Object.entries(submission.answers)) {
        await connection.run(
          `INSERT INTO ${tableRef('completed_answers_long')} (
            submission_id, question_id, answer_json, answer_type, synced_at
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            submission.submission_id,
            questionId,
            JSON.stringify(answer),
            answerType(answer),
            new Date().toISOString(),
          ],
        );
        loadedAnswers += 1;
      }
    }

    await connection.run(`DROP TABLE IF EXISTS ${tableRef('completed_surveys_dataframe_wide')}`);

    const wideBaseColumns = [
      'submission_id',
      'created_at',
      'updated_at',
      'completed_at',
      'survey_version',
      'current_section_index',
      'last_question_id',
      'answers_json',
    ];

    const wideColumnDefs = [
      'submission_id VARCHAR',
      'created_at TIMESTAMP',
      'updated_at TIMESTAMP',
      'completed_at TIMESTAMP',
      'survey_version VARCHAR',
      'current_section_index INTEGER',
      'last_question_id VARCHAR',
      'answers_json JSON',
      ...dynamicColumns.map((column) => `${quoteIdentifier(column.columnName)} JSON`),
    ];

    await connection.run(
      `CREATE TABLE ${tableRef('completed_surveys_dataframe_wide')} (${wideColumnDefs.join(', ')})`,
    );

    const insertColumns = [
      ...wideBaseColumns,
      ...dynamicColumns.map((column) => column.columnName),
    ];

    const insertPlaceholders = insertColumns.map(() => '?').join(', ');

    const insertSql = `INSERT INTO ${tableRef('completed_surveys_dataframe_wide')} (
      ${insertColumns.map((columnName) => quoteIdentifier(columnName)).join(', ')}
    ) VALUES (${insertPlaceholders})`;

    for (const submission of completedSubmissions) {
      const rowValues: Array<string | number | null> = [
        submission.submission_id,
        submission.created_at,
        submission.updated_at,
        submission.updated_at,
        submission.survey_version,
        submission.current_section_index,
        submission.last_question_id,
        JSON.stringify(submission.answers),
      ];

      for (const dynamicColumn of dynamicColumns) {
        if (Object.prototype.hasOwnProperty.call(submission.answers, dynamicColumn.questionId)) {
          rowValues.push(JSON.stringify(submission.answers[dynamicColumn.questionId]));
        } else {
          rowValues.push(null);
        }
      }

      await connection.run(insertSql, rowValues);
    }

    await connection.run(
      `CREATE OR REPLACE VIEW ${tableRef('self_updating_completed_surveys_df')} AS
       SELECT * FROM ${tableRef('completed_surveys_dataframe_wide')}`,
    );

    await ensureCuratedKpiViews(connection);

    await connection.run('COMMIT');
  } catch (error) {
    status = 'failed';
    message = error instanceof Error ? error.message : 'Unknown ELT error';
    await connection.run('ROLLBACK');
    throw error;
  } finally {
    await connection.run(
      `INSERT INTO ${tableRef('elt_runs')} (
        run_id,
        started_at,
        completed_at,
        extracted_submissions,
        loaded_submissions,
        loaded_answers,
        status,
        message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        startedAt,
        new Date().toISOString(),
        extractedSubmissions,
        loadedSubmissions,
        loadedAnswers,
        status,
        message,
      ],
    );
  }

  return {
    extractedSubmissions,
    loadedSubmissions,
    loadedAnswers,
    wideColumns,
    targetCatalog: _targetCatalog,
  };
}

export async function getCompletedSurveyDataframe(limit = 250): Promise<Array<Record<string, unknown>>> {
  const connection = getConnection();
  const safeLimit = Math.max(1, Math.min(limit, 2000));

  const reader = await connection.runAndReadAll(
    `SELECT *
     FROM ${tableRef('self_updating_completed_surveys_df')}
     ORDER BY completed_at DESC
     LIMIT ?`,
    [safeLimit],
  );

  return reader.getRowObjectsJS() as Array<Record<string, unknown>>;
}

export async function getAnalyticsHealth(): Promise<Record<string, unknown>> {
  const connection = getConnection();

  const summaryReader = await connection.runAndReadAll(
    `SELECT
      COUNT(*) AS completed_submissions,
      (SELECT COUNT(*) FROM ${tableRef('completed_answers_long')}) AS completed_answers
     FROM ${tableRef('completed_submissions')}`,
  );

  const runReader = await connection.runAndReadAll(
    `SELECT run_id, completed_at, extracted_submissions, loaded_submissions, loaded_answers, status, message
     FROM ${tableRef('elt_runs')}
     ORDER BY completed_at DESC
     LIMIT 1`,
  );

  return {
    duckdbPath: DUCKDB_PATH,
    targetCatalog: _targetCatalog,
    motherduckAttempted: _motherDuckAttempted,
    motherduckConfigured: Boolean(MOTHERDUCK_DB),
    motherduckRequired: REQUIRE_MOTHERDUCK,
    motherduckConnected: _targetCatalog === 'md',
    motherduckLastError: _lastMotherDuckError,
    quackRequested: LOAD_QUACK,
    counts: summaryReader.getRowObjectsJS()[0] ?? {
      completed_submissions: 0,
      completed_answers: 0,
    },
    lastRun: runReader.getRowObjectsJS()[0] ?? null,
  };
}

export async function getAnalyticsKpiSnapshot(): Promise<AnalyticsKpiSnapshot> {
  const connection = getConnection();

  const overviewReader = await connection.runAndReadAll(
    `SELECT * FROM ${tableRef('kpi_overview')} LIMIT 1`,
  );
  const dailyReader = await connection.runAndReadAll(
    `SELECT * FROM ${tableRef('kpi_daily_completions_30d')}`,
  );
  const questionReader = await connection.runAndReadAll(
    `SELECT * FROM ${tableRef('kpi_question_completion')} LIMIT 100`,
  );
  const answerTypeReader = await connection.runAndReadAll(
    `SELECT * FROM ${tableRef('kpi_answer_type_mix')}`,
  );

  return {
    overview: overviewReader.getRowObjectsJS()[0] ?? {
      total_completed_surveys: 0,
      survey_versions: 0,
      avg_answered_questions: 0,
      median_answered_questions: 0,
      completed_last_24h: 0,
      completed_last_7d: 0,
    },
    dailyCompletions30d: dailyReader.getRowObjectsJS() as Array<Record<string, unknown>>,
    questionCompletion: questionReader.getRowObjectsJS() as Array<Record<string, unknown>>,
    answerTypeMix: answerTypeReader.getRowObjectsJS() as Array<Record<string, unknown>>,
  };
}
