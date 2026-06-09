# TODO - Development Tasks

## High Priority

- [x] Wire persisted survey results to a tabular analytics store with DuckDB as the OLAP engine.
- [x] Define database strategy: keep sql.js as transactional capture and mirror into DuckDB, or replace primary storage with DuckDB-backed workflow.
- [x] Implement ETL/transform step from `submissions` + `answers` JSON payloads into analysis-friendly DuckDB tables/views (wide and long formats).
- [X] Define and enforce canonical resume mechanism for users (submission ID vs one-time token) and expose only one user-facing path.
- [x] Add API security hardening before deployment: restricted CORS origins, payload size limits, basic rate limiting, and secure headers.
- [x] Add automated tests foundation and core coverage: answer validation, SurveyLanding resume UX, survey service retry/error handling, and API route validation.
- [X] Expand automated tests to cover remaining critical flows end-to-end: resume by ID, progress restore, and submit completion.
- [X] Update README documentation to match current runtime and testing workflows.

## Medium Priority

- [ ] Add production health/readiness endpoint(s) for deployment monitoring and startup checks.
- [ ] Improve export pipeline to include detailed answer-level exports (not only submission headers) for downstream analytics.
- [X] Add data retention/backup policy for survey databases and token lifecycle cleanup job (expired token purge).
- [ ] Add environment-driven configuration documentation (`PORT`, `API_BASE`, `VITE_API_URL`, CORS origin list).
- [X] Resolve documentation drift: several docs still reference LowDB/JSON while runtime uses sql.js SQLite.
- [X] Decide on and document migration plan for legacy JS server files (`server/server.js`, `server/database.js`) to avoid accidental use.
- [X] Add informational text to Question ID 30.
- [X] Identify possible pilot PSAPs for testing and feedback.

## Low Priority

- [ ] Add optional responder-facing progress indicator enhancements (section and completion percentage).
- [X] Evaluate admin/reporting dashboard for DuckDB outputs and trend analysis.
- [X] Evaluate archival strategy for old survey versions and cross-version analytics harmonization.

## Completed

- [x] Add input sanitization and bounds validation on the backend for all answer writes (required checks, type checks, min/max, allowed options, length limits).
- [x] Add server-side schema-aware validation per question ID (`server/answerValidator.ts`) — all answer types, option allow-lists, numeric bounds, HTML sanitization, and submissionId format check.
- [x] Add resume code entry UX (input field + action) so a respondent can paste/enter a save code/token without needing URL parameters.
- [x] Follow up with Brandon Abley about hosting and Mother Duck access.
- [x] Review the introduction text to ensure alignment with latest project goals.
- [x] Review the survey completion text for working-group approval.
- [x] Implement debounced auto-save with retry and offline queue support.
- [x] Implement server-side progress persistence (`current_section_index`, `last_question_id`).
- [x] Implement resume token issue/consume API with one-time token semantics.
- [x] Implement resume via URL token parameter (`?t=`) as the canonical user-facing resume path.
- [x] Add an automated test stack (Vitest + Testing Library + Supertest) with passing baseline suites for frontend, service, and server routes.
- [x] Add positive numeric input validation for Question 29 "Other (Please Specify)".
- [x] Alphabetize glossary terms by `term` field in `glossary_data.json`.
- [x] Render info-type questions (id 0 Welcome, id 39 Closing) as non-interactive prose blocks with no question number, label, or input.

## Notes

- Deployment readiness currently depends most on backend validation, security hardening, and test coverage.
- DuckDB integration should be designed first as a data model decision (source-of-truth and sync direction) before coding.
- User-facing save/return now includes explicit code-entry UI and validation messaging; remaining work is canonical method decisions and progress/status UX clarity.

## Save Feature Workflow

### Already Implemented ✓

1. **Auto-save** - Answers save automatically as users type (500ms debounce)
2. **Database storage** - All answers stored with submission ID
3. **Retrieval API** - Backend endpoint to fetch saved submissions exists
4. **Offline support** - Queues saves when offline and syncs later
5. **Server progress tracking** - Section index and last question are persisted
6. **Token resume support** - One-time resume tokens can route to target version/section
7. **Resume entry UI** - Respondents can enter a save code from the landing page
8. **Validation messaging** - Expired/invalid/network resume code error states are implemented

### Remaining Work for Full Resume Support

#### Easy Changes (30-60 min)

1. **Responder guidance** - Add plain-language instructions for save/return process

#### Medium Complexity (1-2 hours)

1. **Single canonical resume method** - Choose one user-facing method (code or link) and remove ambiguity
2. **Resume state UX** - Show saved timestamp/section when a resume target is loaded
3. **Progress visualization** - Show which sections/questions are completed

#### Nice-to-Have (2-4 hours)

1. **Email resume links** - Allow users to email themselves a resume link
2. **Expiration logic** - Auto-delete incomplete submissions after 7 days
3. **Progress bar enhancement** - Show actual completion percentage

### Implementation Difficulty

**Overall: Easy to Moderate** (2-4 hours total)

The core persistence path is done. Remaining work is primarily canonical resume flow decisions, progress/state UX clarity, security hardening, and deployment readiness tasks.
