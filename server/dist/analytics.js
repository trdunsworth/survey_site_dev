import path from 'path';
import { fileURLToPath } from 'url';
import { DuckDBInstance } from '@duckdb/node-api';
import { getCompletedSubmissionsWithAnswers } from './database';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DUCKDB_PATH = process.env.DUCKDB_PATH ?? path.join(__dirname, 'survey_analytics.duckdb');
const MOTHERDUCK_DB = process.env.MOTHERDUCK_DB;
const MOTHERDUCK_TOKEN = process.env.MOTHERDUCK_TOKEN;
const LOAD_QUACK = process.env.DUCKDB_LOAD_QUACK !== 'false';
let _conn = null;
let _targetCatalog = 'main';
function quoteIdentifier(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
}
function escapeSqlLiteral(value) {
    return value.replace(/'/g, "''");
}
function tableRef(tableName) {
    return `${quoteIdentifier(_targetCatalog)}.${quoteIdentifier('main')}.${quoteIdentifier(tableName)}`;
}
function toDataframeColumn(questionId) {
    const cleaned = questionId.replace(/[^a-zA-Z0-9_]/g, '_');
    return `q_${cleaned}`;
}
function getConnection() {
    if (!_conn) {
        throw new Error('[analytics] DuckDB connection is not initialized. Call initAnalyticsStore() first.');
    }
    return _conn;
}
async function loadExtensionBestEffort(connection, extensionName) {
    try {
        await connection.run(`INSTALL ${extensionName}`);
        await connection.run(`LOAD ${extensionName}`);
        return true;
    }
    catch (error) {
        console.warn(`[analytics] Failed to load extension '${extensionName}':`, error);
        return false;
    }
}
async function ensureAnalyticsObjects(connection) {
    await connection.run(`CREATE TABLE IF NOT EXISTS ${tableRef('completed_submissions')} (
      submission_id VARCHAR PRIMARY KEY,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      completed_at TIMESTAMP,
      survey_version VARCHAR,
      current_section_index INTEGER,
      last_question_id VARCHAR,
      answers_json JSON,
      synced_at TIMESTAMP
    )`);
    await connection.run(`CREATE TABLE IF NOT EXISTS ${tableRef('completed_answers_long')} (
      submission_id VARCHAR,
      question_id VARCHAR,
      answer_json JSON,
      answer_type VARCHAR,
      synced_at TIMESTAMP
    )`);
    await connection.run(`CREATE TABLE IF NOT EXISTS ${tableRef('elt_runs')} (
      run_id VARCHAR,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      extracted_submissions INTEGER,
      loaded_submissions INTEGER,
      loaded_answers INTEGER,
      status VARCHAR,
      message VARCHAR
    )`);
    await connection.run(`CREATE OR REPLACE VIEW ${tableRef('completed_surveys_dataframe_long')} AS
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
       ON s.submission_id = a.submission_id`);
}
async function attachMotherDuck(connection) {
    if (!MOTHERDUCK_DB) {
        return;
    }
    const loaded = await loadExtensionBestEffort(connection, 'motherduck');
    if (!loaded) {
        return;
    }
    const mdUri = MOTHERDUCK_TOKEN
        ? `md:${MOTHERDUCK_DB}?motherduck_token=${encodeURIComponent(MOTHERDUCK_TOKEN)}`
        : `md:${MOTHERDUCK_DB}`;
    await connection.run(`ATTACH '${escapeSqlLiteral(mdUri)}' AS md`);
    _targetCatalog = 'md';
    console.log(`[analytics] Connected to MotherDuck database '${MOTHERDUCK_DB}'`);
}
function answerType(answer) {
    if (Array.isArray(answer))
        return 'array';
    if (answer === null)
        return 'null';
    return typeof answer;
}
export async function initAnalyticsStore() {
    const instance = await DuckDBInstance.create(DUCKDB_PATH);
    const connection = await instance.connect();
    _conn = connection;
    await connection.run('PRAGMA threads=4');
    if (LOAD_QUACK) {
        await loadExtensionBestEffort(connection, 'quack');
    }
    try {
        await attachMotherDuck(connection);
    }
    catch (error) {
        _targetCatalog = 'main';
        console.warn('[analytics] MotherDuck attach failed; using local DuckDB file instead.', error);
    }
    await ensureAnalyticsObjects(connection);
    console.log(`[analytics] DuckDB analytics store ready at ${DUCKDB_PATH}`);
}
export async function syncCompletedSurveyDataframe() {
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
        const questionIds = Array.from(new Set(completedSubmissions.flatMap((submission) => Object.keys(submission.answers)))).sort();
        const dynamicColumns = questionIds.map((questionId) => ({
            questionId,
            columnName: toDataframeColumn(questionId),
        }));
        wideColumns = dynamicColumns.length;
        await connection.run('BEGIN TRANSACTION');
        await connection.run(`DELETE FROM ${tableRef('completed_answers_long')}`);
        await connection.run(`DELETE FROM ${tableRef('completed_submissions')}`);
        for (const submission of completedSubmissions) {
            await connection.run(`INSERT INTO ${tableRef('completed_submissions')} (
          submission_id, created_at, updated_at, completed_at, survey_version,
          current_section_index, last_question_id, answers_json, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                submission.submission_id,
                submission.created_at,
                submission.updated_at,
                submission.updated_at,
                submission.survey_version,
                submission.current_section_index,
                submission.last_question_id,
                JSON.stringify(submission.answers),
                new Date().toISOString(),
            ]);
            loadedSubmissions += 1;
            for (const [questionId, answer] of Object.entries(submission.answers)) {
                await connection.run(`INSERT INTO ${tableRef('completed_answers_long')} (
            submission_id, question_id, answer_json, answer_type, synced_at
          ) VALUES (?, ?, ?, ?, ?)`, [
                    submission.submission_id,
                    questionId,
                    JSON.stringify(answer),
                    answerType(answer),
                    new Date().toISOString(),
                ]);
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
        await connection.run(`CREATE TABLE ${tableRef('completed_surveys_dataframe_wide')} (${wideColumnDefs.join(', ')})`);
        const insertColumns = [
            ...wideBaseColumns,
            ...dynamicColumns.map((column) => column.columnName),
        ];
        const insertPlaceholders = insertColumns.map(() => '?').join(', ');
        const insertSql = `INSERT INTO ${tableRef('completed_surveys_dataframe_wide')} (
      ${insertColumns.map((columnName) => quoteIdentifier(columnName)).join(', ')}
    ) VALUES (${insertPlaceholders})`;
        for (const submission of completedSubmissions) {
            const rowValues = [
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
                }
                else {
                    rowValues.push(null);
                }
            }
            await connection.run(insertSql, rowValues);
        }
        await connection.run(`CREATE OR REPLACE VIEW ${tableRef('self_updating_completed_surveys_df')} AS
       SELECT * FROM ${tableRef('completed_surveys_dataframe_wide')}`);
        await connection.run('COMMIT');
    }
    catch (error) {
        status = 'failed';
        message = error instanceof Error ? error.message : 'Unknown ELT error';
        await connection.run('ROLLBACK');
        throw error;
    }
    finally {
        await connection.run(`INSERT INTO ${tableRef('elt_runs')} (
        run_id,
        started_at,
        completed_at,
        extracted_submissions,
        loaded_submissions,
        loaded_answers,
        status,
        message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            runId,
            startedAt,
            new Date().toISOString(),
            extractedSubmissions,
            loadedSubmissions,
            loadedAnswers,
            status,
            message,
        ]);
    }
    return {
        extractedSubmissions,
        loadedSubmissions,
        loadedAnswers,
        wideColumns,
        targetCatalog: _targetCatalog,
    };
}
export async function getCompletedSurveyDataframe(limit = 250) {
    const connection = getConnection();
    const safeLimit = Math.max(1, Math.min(limit, 2000));
    const reader = await connection.runAndReadAll(`SELECT *
     FROM ${tableRef('self_updating_completed_surveys_df')}
     ORDER BY completed_at DESC
     LIMIT ?`, [safeLimit]);
    return reader.getRowObjectsJS();
}
export async function getAnalyticsHealth() {
    const connection = getConnection();
    const summaryReader = await connection.runAndReadAll(`SELECT
      COUNT(*) AS completed_submissions,
      (SELECT COUNT(*) FROM ${tableRef('completed_answers_long')}) AS completed_answers
     FROM ${tableRef('completed_submissions')}`);
    const runReader = await connection.runAndReadAll(`SELECT run_id, completed_at, extracted_submissions, loaded_submissions, loaded_answers, status, message
     FROM ${tableRef('elt_runs')}
     ORDER BY completed_at DESC
     LIMIT 1`);
    return {
        duckdbPath: DUCKDB_PATH,
        targetCatalog: _targetCatalog,
        motherduckConfigured: Boolean(MOTHERDUCK_DB),
        quackRequested: LOAD_QUACK,
        counts: summaryReader.getRowObjectsJS()[0] ?? {
            completed_submissions: 0,
            completed_answers: 0,
        },
        lastRun: runReader.getRowObjectsJS()[0] ?? null,
    };
}
