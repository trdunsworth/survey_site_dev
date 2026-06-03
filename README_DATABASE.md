# Survey Database Setup

## Overview

The backend uses a two-store pattern:

- Transactional capture in SQLite (`sql.js`) for API writes.
- Analytics ELT into DuckDB for OLAP queries and dataframe-style access.

DuckDB can run locally or attach to MotherDuck.

## Storage Layers

### 1) Transactional capture store (`server/survey_responses.db`)

Managed by `server/db.ts` + `server/database.ts`.

Primary tables:

- `submissions`
- `answers`
- `resume_tokens`

This layer is the source of truth for survey intake.

### 2) Analytics store (`server/survey_analytics.duckdb` by default)

Managed by `server/analytics.ts`.

ELT output objects:

- `completed_submissions`
- `completed_answers_long`
- `completed_surveys_dataframe_wide`
- `completed_surveys_dataframe_long` (view)
- `self_updating_completed_surveys_df` (view)
- `kpi_overview` (view)
- `kpi_daily_completions_30d` (view)
- `kpi_question_completion` (view)
- `kpi_answer_type_mix` (view)
- `elt_runs`

## ELT Triggers

- Full sync on server startup.
- Incremental full-refresh sync when a submission is marked complete.

The sync extracts all completed submissions from the transactional store and rebuilds long/wide analytics tables in DuckDB.

## MotherDuck + Quack

Optional environment variables:

- `MOTHERDUCK_DB`: MotherDuck database name to attach.
- `MOTHERDUCK_TOKEN`: Token for MotherDuck attach URI.
- `DUCKDB_LOAD_QUACK`: Attempts `INSTALL/LOAD quack` (default `true`).

If MotherDuck attach fails, analytics falls back to local DuckDB automatically.

## Analytics API Endpoints

- `GET /api/analytics/health`
  - Returns target catalog, row counts, and last ELT run metadata.

- `GET /api/analytics/completed-surveys?limit=250`
  - Returns rows from `self_updating_completed_surveys_df`.

- `GET /api/analytics/kpis`
  - Returns a curated KPI snapshot for dashboard cards/tables/charts.

- `POST /api/analytics/refresh`
  - Forces an ELT sync and returns sync summary payload.

## Run

```bash
npm install
npm run dev:all
```

## API Security Hardening

The API server applies baseline hardening middleware:

- `helmet` secure headers
- CORS allowlist enforcement
- JSON/urlencoded payload size limits
- IP-based API rate limiting

Environment configuration:

- `CORS_ALLOWED_ORIGINS`: Comma-separated origin allowlist
- `API_BODY_LIMIT`: Request payload size limit (for example, `64kb`)
- `API_RATE_LIMIT_WINDOW_MS`: Rate-limit window in milliseconds
- `API_RATE_LIMIT_MAX`: Max requests per IP per window
