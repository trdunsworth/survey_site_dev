import { useMotherDuck } from '../hooks/useMotherDuck';
import type { AnswerValue } from '../types';
import type { DuckDBRow } from '@motherduck/wasm-client';

export interface SurveySubmission {
  submission_id: string;
  created_at: string;
  completed_at: string;
  survey_version: string;
  current_section_index: number;
  last_question_id: string | null;
  updated_at: string;
  answers: Record<string, AnswerValue>;
}

export interface AnalyticsData {
  totalCompleted: number;
  questionCompletion: Array<{ question_id: string; count: number }>;
  dailyCompletions: Array<{ day: string; count: number }>;
  surveyVersions: Array<{ survey_version: string; count: number }>;
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
}

// Helper to convert DuckDBRow to plain objects with proper types
function toNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function mapRows<T>(rows: readonly DuckDBRow[], mapper: (row: DuckDBRow) => T): T[] {
  return rows.map(mapper);
}

export function createMotherDuckService(getState: () => ReturnType<typeof useMotherDuck>) {
  const db = import.meta.env.VITE_MOTHERDUCK_DB || 'nena_survey';
  const fullTable = (table: string) => `${db}.${table}`;

  return {
    /**
     * Submit completed survey to MotherDuck
     * Called after localStorage save succeeds
     */
    async submitSurvey(submission: SurveySubmission): Promise<void> {
      const { executeInsert } = getState();

      // Insert into survey_responses (flattened + JSON)
      await executeInsert(fullTable('survey_responses'), {
        submission_id: submission.submission_id,
        created_at: submission.created_at,
        completed_at: submission.completed_at,
        survey_version: submission.survey_version,
        current_section_index: submission.current_section_index,
        last_question_id: submission.last_question_id,
        updated_at: submission.updated_at,
        answers_json: JSON.stringify(submission.answers),
      });

      // Insert each answer into survey_answers (normalized)
      const insertPromises = Object.entries(submission.answers).map(
        ([questionId, answer]) =>
          executeInsert(fullTable('survey_answers'), {
            submission_id: submission.submission_id,
            question_id: questionId,
            answer_json: JSON.stringify(answer),
            created_at: submission.completed_at,
          })
      );

      await Promise.all(insertPromises);
    },

    /**
     * Fetch aggregated analytics for dashboard
     */
    async fetchAnalytics(): Promise<AnalyticsData> {
      const { executeQuery } = getState();

      // Run queries in parallel
      const [
        totalResult,
        questionResult,
        dailyResult,
        versionResult,
      ] = await Promise.all([
        executeQuery(`
          SELECT COUNT(*) as total
          FROM ${fullTable('survey_responses')}
          WHERE completed_at IS NOT NULL
        `),
        executeQuery(`
          SELECT question_id, COUNT(*) as count
          FROM ${fullTable('survey_answers')}
          GROUP BY question_id
          ORDER BY count DESC
        `),
        executeQuery(`
          SELECT DATE(completed_at) as day, COUNT(*) as count
          FROM ${fullTable('survey_responses')}
          WHERE completed_at >= CURRENT_DATE - INTERVAL '30 days'
            AND completed_at IS NOT NULL
          GROUP BY DATE(completed_at)
          ORDER BY day
        `),
        executeQuery(`
          SELECT survey_version, COUNT(*) as count
          FROM ${fullTable('survey_responses')}
          WHERE completed_at IS NOT NULL
          GROUP BY survey_version
        `),
      ]);

      return {
        totalCompleted: toNumber(totalResult.data.toRows()[0]?.total ?? 0),
        questionCompletion: mapRows(questionResult.data.toRows(), (row) => ({
          question_id: String(row.question_id),
          count: toNumber(row.count),
        })),
        dailyCompletions: mapRows(dailyResult.data.toRows(), (row) => ({
          day: String(row.day),
          count: toNumber(row.count),
        })),
        surveyVersions: mapRows(versionResult.data.toRows(), (row) => ({
          survey_version: String(row.survey_version),
          count: toNumber(row.count),
        })),
      };
    },

    /**
     * Fetch recent submissions for detailed view
     */
    async fetchRecentSubmissions(limit = 100) {
      const { executeQuery } = getState();

      const result = await executeQuery(`
        SELECT * FROM ${fullTable('survey_responses')}
        WHERE completed_at IS NOT NULL
        ORDER BY completed_at DESC
        LIMIT ?
      `, [limit]);

      return result.data.toRows();
    },

    /**
     * Test connection health
     */
    async healthCheck(): Promise<HealthCheckResult> {
      const { executeQuery } = getState();
      const start = performance.now();
      try {
        await executeQuery('SELECT 1 as test');
        return { healthy: true, latencyMs: performance.now() - start };
      } catch {
        return { healthy: false, latencyMs: performance.now() - start };
      }
    },
  };
}