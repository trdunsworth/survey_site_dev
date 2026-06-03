import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAnalyticsHealth,
  fetchAnalyticsKpis,
  refreshAnalytics,
} from '../services/surveyService';
import type {
  AnalyticsAnswerTypeMix,
  AnalyticsDailyCompletion,
  AnalyticsHealthResponse,
  AnalyticsKpiSnapshot,
  AnalyticsQuestionCompletion,
} from '../types';

const POLL_INTERVAL_MS = 30_000;

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function shortDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const AnalyticsDashboard: React.FC = () => {
  const [health, setHealth] = useState<AnalyticsHealthResponse | null>(null);
  const [kpis, setKpis] = useState<AnalyticsKpiSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setError(null);
      const [healthPayload, kpiPayload] = await Promise.all([
        fetchAnalyticsHealth(),
        fetchAnalyticsKpis(),
      ]);
      setHealth(healthPayload);
      setKpis(kpiPayload);
      setLastLoadedAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load analytics data';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();

    const timer = window.setInterval(() => {
      void loadDashboard();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const handleRefresh = async (): Promise<void> => {
    try {
      setIsRefreshing(true);
      setError(null);
      await refreshAnalytics();
      await loadDashboard();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh analytics data';
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const overviewCards = useMemo(() => {
    if (!kpis) return [];

    const o = kpis.overview;
    return [
      { label: 'Completed Surveys', value: toNumber(o.total_completed_surveys) },
      { label: 'Completed (24h)', value: toNumber(o.completed_last_24h) },
      { label: 'Completed (7d)', value: toNumber(o.completed_last_7d) },
      { label: 'Survey Versions', value: toNumber(o.survey_versions) },
      { label: 'Avg Questions Answered', value: toNumber(o.avg_answered_questions).toFixed(2) },
      { label: 'Median Questions Answered', value: toNumber(o.median_answered_questions).toFixed(2) },
    ];
  }, [kpis]);

  const dailySeries: AnalyticsDailyCompletion[] = kpis?.dailyCompletions30d ?? [];
  const questionCompletion: AnalyticsQuestionCompletion[] = kpis?.questionCompletion ?? [];
  const answerTypeMix: AnalyticsAnswerTypeMix[] = kpis?.answerTypeMix ?? [];

  const peakDaily = Math.max(1, ...dailySeries.map((row) => toNumber(row.completed_surveys)));

  return (
    <section className="analytics-dashboard" aria-live="polite">
      <header className="analytics-dashboard__header">
        <div>
          <h2 className="analytics-dashboard__title">Analytics Dashboard</h2>
          <p className="analytics-dashboard__subtitle">
            Self-updating KPI views from completed surveys in DuckDB/MotherDuck
          </p>
        </div>
        <div className="analytics-dashboard__actions">
          <button
            type="button"
            className="analytics-dashboard__refresh-btn"
            onClick={() => {
              void handleRefresh();
            }}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh ELT'}
          </button>
        </div>
      </header>

      {error && <p className="analytics-dashboard__error">{error}</p>}

      {isLoading ? (
        <div className="analytics-dashboard__loading">Loading analytics...</div>
      ) : (
        <>
          <section className="analytics-dashboard__meta">
            <div><strong>Catalog:</strong> {health?.targetCatalog ?? 'N/A'}</div>
            <div><strong>MotherDuck configured:</strong> {health?.motherduckConfigured ? 'Yes' : 'No'}</div>
            <div><strong>Quack requested:</strong> {health?.quackRequested ? 'Yes' : 'No'}</div>
            <div><strong>Last ELT run:</strong> {formatDateTime(health?.lastRun?.completed_at ?? null)}</div>
            <div><strong>Last dashboard load:</strong> {formatDateTime(lastLoadedAt)}</div>
          </section>

          <section className="analytics-dashboard__cards">
            {overviewCards.map((card) => (
              <article key={card.label} className="analytics-dashboard__card">
                <h3>{card.label}</h3>
                <p>{card.value}</p>
              </article>
            ))}
          </section>

          <section className="analytics-dashboard__grid">
            <article className="analytics-panel analytics-panel--chart">
              <h3>30-Day Completion Trend</h3>
              <div className="analytics-bar-list">
                {dailySeries.length === 0 ? (
                  <p className="analytics-panel__empty">No completion activity in the last 30 days.</p>
                ) : (
                  dailySeries.map((row) => {
                    const count = toNumber(row.completed_surveys);
                    const width = (count / peakDaily) * 100;
                    return (
                      <div key={`${row.completion_day}`} className="analytics-bar-row">
                        <span>{shortDay(String(row.completion_day))}</span>
                        <div className="analytics-bar-track">
                          <div className="analytics-bar-fill" style={{ width: `${width}%` }} />
                        </div>
                        <span>{count}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </article>

            <article className="analytics-panel">
              <h3>Top Question Completion Rates</h3>
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Question ID</th>
                    <th>Answers</th>
                    <th>Completion %</th>
                  </tr>
                </thead>
                <tbody>
                  {questionCompletion.slice(0, 15).map((row) => (
                    <tr key={row.question_id}>
                      <td>{row.question_id}</td>
                      <td>{toNumber(row.answered_count)}</td>
                      <td>{toNumber(row.completion_rate_pct).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>

            <article className="analytics-panel">
              <h3>Answer Type Mix</h3>
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Count</th>
                    <th>% of Answers</th>
                  </tr>
                </thead>
                <tbody>
                  {answerTypeMix.map((row) => (
                    <tr key={row.answer_type}>
                      <td>{row.answer_type}</td>
                      <td>{toNumber(row.answer_count)}</td>
                      <td>{toNumber(row.pct_of_answers).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </section>
        </>
      )}
    </section>
  );
};

export default AnalyticsDashboard;
