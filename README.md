# survey_site_dev

NENA Survey Site with transactional capture in `sql.js` and analytics ELT in DuckDB.

## Runtime Architecture

- Frontend: Vite + React
- API server: Express + TypeScript (`server/server.ts`)
- Transactional capture store: SQLite via `sql.js` (`server/survey_responses.db`)
- Analytics store: DuckDB (`server/survey_analytics.duckdb` by default)
- Optional cloud analytics target: MotherDuck (`MOTHERDUCK_DB` + `MOTHERDUCK_TOKEN`)
- Optional extension load: Quack (`DUCKDB_LOAD_QUACK`, default `true`)

## How The ELT Works

1. Survey writes continue to land in the transactional SQLite capture tables.
2. On server startup, a full analytics sync runs.
3. On survey completion (`POST /api/submissions/:submissionId/complete`), ELT runs again.
4. ELT extracts all completed submissions + answers and rebuilds.

- `completed_submissions`
- `completed_answers_long`
- `completed_surveys_dataframe_wide`
- `self_updating_completed_surveys_df` (view)

This gives you a self-updating dataframe of completed surveys in both long and wide forms.

## Environment Variables

- `PORT`: API port (default `3001`)
- `API_BASE`: Optional API base path prefix (default empty)
- `CORS_ALLOWED_ORIGINS`: Comma-separated allowed origins for API CORS (defaults to local dev origins only)
- `API_BODY_LIMIT`: Max JSON/urlencoded request body size (default `64kb`)
- `API_RATE_LIMIT_WINDOW_MS`: Rate-limit time window in ms (default `900000`, 15 minutes)
- `API_RATE_LIMIT_MAX`: Max API requests per client IP per window (default `300`)
- `DUCKDB_PATH`: Local DuckDB file path (default `server/survey_analytics.duckdb`)
- `MOTHERDUCK_DB`: MotherDuck database name (optional)
- `MOTHERDUCK_TOKEN`: MotherDuck access token (optional)
- `DUCKDB_LOAD_QUACK`: Load Quack extension (`true` by default, set `false` to skip)
- `INCOMPLETE_PURGE_DAYS`: Retain incomplete submissions for this many days (default `7`)
- `COMPLETED_ARCHIVE_DAYS`: Keep completed submissions active for this many days before archiving (default `365`)
- `RETENTION_SWEEP_INTERVAL_MS`: Interval for scheduled retention sweeps (default `21600000`, 6 hours)
- `SMTP_HOST`: SMTP hostname for optional resume-token emails
- `SMTP_PORT`: SMTP port (e.g., `587`)
- `SMTP_USER`: SMTP auth username
- `SMTP_PASS`: SMTP auth password
- `SMTP_FROM`: Sender address for resume-token emails

## Data Retention Policy

- Resume tokens are valid for 7 days.
- Incomplete submissions are purged after the retention window when no unexpired issued token remains.
- Completed submissions remain active for 12 months and then transition to `archived` state.
- Retention sweeps run on startup and on a configurable schedule.

## API Endpoints

Core survey endpoints:

- `POST /api/submissions`
- `POST /api/answers`
- `PUT /api/submissions/:submissionId/progress`
- `POST /api/submissions/:submissionId/complete`
- `GET /api/submissions/:submissionId`
- `GET /api/submissions`
- `GET /api/export/csv`
- `POST /api/tokens/issue`
- `POST /api/tokens/consume`

Analytics endpoints:

- `GET /api/analytics/health`
- `GET /api/analytics/completed-surveys?limit=250`
- `GET /api/analytics/kpis`
- `POST /api/analytics/refresh`

## Analytics Dashboard

- Survey UI: `/?view=survey` (or just `/`)
- Dashboard UI: `/?view=dashboard`

The dashboard auto-refreshes every 30 seconds and includes:

- ELT health metadata
- KPI overview cards
- 30-day completion trend
- Top question completion rates
- Answer type mix

## Local Run

```bash
npm install
npm run dev:all
```

Frontend: `http://localhost:5173`

API: `http://localhost:3001`

## Testing

Detailed test workflows and manual rerun instructions are documented in `TESTING.md`.

Run the full automated suite:

```bash
npm test
```

Run only server route and validation tests:

```bash
npx vitest run server/server.test.ts server/answerValidator.test.ts --reporter=verbose
```

Run retention-policy tests:

```bash
npx vitest run server/database.retention.test.ts --reporter=verbose
```

Current automated coverage includes:

- Core submission lifecycle routes
- Answer validation and sanitization behavior
- Resume-token issue/consume paths (including invalid token responses)
- Security middleware checks (CORS and x-powered-by)
- Analytics API routes, including refresh summary and limit parsing
