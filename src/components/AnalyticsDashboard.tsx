import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMotherDuck } from '../hooks/useMotherDuck';
import { createMotherDuckService, type AnalyticsData } from '../services/motherduckService';
import { MotherDuckConnect } from './MotherDuckConnect';

const POLL_INTERVAL_MS = 60_000;

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'bigint') return Number(value);
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
  const motherDuck = useMotherDuck();
  const mdService = createMotherDuckService(() => motherDuck);

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!motherDuck.isConnected) return;

    try {
      setError(null);
      const analytics = await mdService.fetchAnalytics();
      setData(analytics);
      setLastLoadedAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load analytics data';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [motherDuck.isConnected, mdService]);

  useEffect(() => {
    if (motherDuck.isConnected) {
      void loadDashboard();

      const timer = window.setInterval(() => {
        void loadDashboard();
      }, POLL_INTERVAL_MS);

      return () => window.clearInterval(timer);
    }
  }, [loadDashboard, motherDuck.isConnected]);

  const handleRefresh = async (): Promise<void> => {
    if (!motherDuck.isConnected) return;

    try {
      setIsRefreshing(true);
      setError(null);
      await loadDashboard();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh analytics data';
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const overviewCards = useMemo(() => {
    if (!data) return [];

    return [
      { label: 'Completed Surveys', value: toNumber(data.totalCompleted) },
      { label: 'Completed (24h)', value: toNumber(data.dailyCompletions.filter(d => {
        const day = new Date(d.day).getTime();
        const now = Date.now();
        return now - day <= 24 * 60 * 60 * 1000;
      }).reduce((sum, d) => sum + toNumber(d.count), 0)) },
      { label: 'Completed (7d)', value: toNumber(data.dailyCompletions.filter(d => {
        const day = new Date(d.day).getTime();
        const now = Date.now();
        return now - day <= 7 * 24 * 60 * 60 * 1000;
      }).reduce((sum, d) => sum + toNumber(d.count), 0)) },
      { label: 'Survey Versions', value: toNumber(data.surveyVersions.length) },
      { 
        label: 'Avg Questions Answered', 
        value: data.questionCompletion.length > 0 
          ? (data.questionCompletion.reduce((sum, q) => sum + toNumber(q.count), 0) / data.totalCompleted).toFixed(2)
          : '0'
      },
      { 
        label: 'Median Questions Answered', 
        value: data.questionCompletion.length > 0
          ? toNumber(data.questionCompletion.sort((a, b) => toNumber(a.count) - toNumber(b.count))[Math.floor(data.questionCompletion.length / 2)].count)
          : '0'
      },
    ];
  }, [data]);

  const dailySeries = data?.dailyCompletions ?? [];
  const questionCompletion = data?.questionCompletion ?? [];
  const surveyVersions = data?.surveyVersions ?? [];

  const peakDaily = Math.max(1, ...dailySeries.map((row) => toNumber(row.count)));

  // Show connection UI if not connected
  if (!motherDuck.isConnected) {
    return (
      <section className="analytics-dashboard" aria-live="polite">
        <header className="analytics-dashboard__header">
          <div>
            <h2 className="analytics-dashboard__title">Analytics Dashboard</h2>
            <p className="analytics-dashboard__subtitle">
              Connect to MotherDuck to view centralized survey analytics
            </p>
          </div>
        </header>
        <MotherDuckConnect onConnect={loadDashboard} />
      </section>
    );
  }

  return (
    <section className="analytics-dashboard" aria-live="polite">
      <header className="analytics-dashboard__header">
        <div>
          <h2 className="analytics-dashboard__title">Analytics Dashboard</h2>
          <p className="analytics-dashboard__subtitle">
            Live KPI views from MotherDuck (synced from completed surveys)
          </p>
        </div>
        <div className="analytics-dashboard__actions">
          <MotherDuckConnect compact onConnect={loadDashboard} />
          <button
            type="button"
            className="analytics-dashboard__refresh-btn"
            onClick={() => { void handleRefresh(); }}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <p className="analytics-dashboard__error">{error}</p>}

      {isLoading ? (
        <div className="analytics-dashboard__loading">Loading analytics...</div>
      ) : (
        <>
          <section className="analytics-dashboard__meta">
            <div><strong>Source:</strong> MotherDuck (WASM)</div>
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
                    const count = toNumber(row.count);
                    const width = (count / peakDaily) * 100;
                    return (
                      <div key={`${row.day}`} className="analytics-bar-row">
                        <span>{shortDay(String(row.day))}</span>
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
                      <td>{toNumber(row.count)}</td>
                      <td>{data && data.totalCompleted > 0 ? ((toNumber(row.count) / data.totalCompleted) * 100).toFixed(2) : '0'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>

            <article className="analytics-panel">
              <h3>Survey Versions</h3>
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {surveyVersions.map((row) => (
                    <tr key={row.survey_version}>
                      <td>{row.survey_version}</td>
                      <td>{toNumber(row.count)}</td>
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