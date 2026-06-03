# Testing Guide

This project uses Vitest for both frontend and backend automated tests.

## Quick Start

Install dependencies:

```bash
npm install
```

Run all tests once:

```bash
npm test
```

Run with verbose output:

```bash
npx vitest run --reporter=verbose
```

## Run Targeted Test Groups

Backend API routes + answer validation + analytics module:

```bash
npx vitest run server/server.test.ts server/answerValidator.test.ts server/analytics.test.ts server/database.retention.test.ts --reporter=verbose
```

Frontend app and landing flow tests:

```bash
npx vitest run src/App.test.tsx src/components/SurveyLanding.test.tsx --reporter=verbose
```

Service-layer retry and error mapping tests:

```bash
npx vitest run src/services/surveyService.test.ts --reporter=verbose
```

## Manual Workflow For Future Runs

1. Pull latest changes and install dependencies with `npm install`.
2. Run full suite with `npm test`.
3. If failures appear, rerun only the failing files using `npx vitest run <path-to-test> --reporter=verbose`.
4. After backend changes, always run backend-focused tests:
   - `server/server.test.ts`
   - `server/answerValidator.test.ts`
   - `server/analytics.test.ts`
   - `server/database.retention.test.ts`
5. After frontend changes, run affected UI/service tests.
6. Before merging, rerun `npm test` to ensure clean pass.

## Coverage

Generate coverage output:

```bash
npm run test:coverage
```

Coverage artifacts are written under the `coverage/` directory.

## What The Tests Cover

- Server route behavior (validation, token lifecycle, analytics endpoints, security headers/CORS)
- Answer validation and sanitization rules
- Analytics store qualification behavior for local DuckDB vs MotherDuck fallback
- Retention sweep behavior for token expiry, incomplete-data purge, and completed-data archiving
- Client routing and landing/resume UX states
- Client service retry logic and API failure mapping

## PR Checklist By Change Type

Use this quick checklist before opening or merging a PR.

### 1) Server-only changes

Minimum commands:

```bash
npx vitest run server/server.test.ts server/answerValidator.test.ts server/analytics.test.ts server/database.retention.test.ts --reporter=verbose
```

Examples:

- API route changes in `server/server.ts`
- Validation logic changes in `server/answerValidator.ts`
- Analytics pipeline or catalog/schema qualification changes in `server/analytics.ts`

### 2) Frontend-only changes

Minimum commands:

```bash
npx vitest run src/App.test.tsx src/components/SurveyLanding.test.tsx src/services/surveyService.test.ts --reporter=verbose
```

Examples:

- View routing or layout/render updates
- Landing/resume UX updates
- Client API handling or retry logic changes

### 3) Shared contract changes (frontend + backend)

Minimum commands:

```bash
npm test
```

Examples:

- API request/response shape updates
- Token lifecycle behavior updates
- Submission payload or analytics response format changes

### 4) Pre-merge final check

Always run once before merge:

```bash
npm test
```

## Notes

- Some tests intentionally log expected errors to stderr to verify failure handling paths.
- These stderr logs do not indicate a failed run unless Vitest reports failed tests.
