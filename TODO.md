# TODO - Development Tasks

## High Priority

- [ ] Wire persisted survey results to a tabular analytics store with DuckDB as the OLAP engine.
- [ ] Define database strategy: keep sql.js as transactional capture and mirror into DuckDB, or replace primary storage with DuckDB-backed workflow.
- [ ] Implement ETL/transform step from `submissions` + `answers` JSON payloads into analysis-friendly DuckDB tables/views (wide and long formats).
- [ ] Add input sanitization and bounds validation on the backend for all answer writes (required checks, type checks, min/max, allowed options, length limits).
- [ ] Add server-side schema-aware validation per question ID to prevent invalid payloads bypassing frontend checks.
- [ ] Add resume code entry UX (input field + action) so a respondent can paste/enter a save code/token without needing URL parameters.
- [ ] Define and enforce canonical resume mechanism for users (submission ID vs one-time token) and expose only one user-facing path.
- [ ] Add API security hardening before deployment: restricted CORS origins, payload size limits, basic rate limiting, and secure headers.
- [ ] Add automated tests for critical flows: save answer, resume by ID/token, progress restore, submit completion, and invalid payload rejection.
- [ ] Update the README.md file for instructions and clarity.
- [ ] Follow up with Brandon Abley about hosting and Mother Duck access.

## Medium Priority

- [ ] Review the introduction text to ensure alignment with latest project goals.
- [ ] Review the survey completion text for working-group approval.
- [ ] Add production health/readiness endpoint(s) for deployment monitoring and startup checks.
- [ ] Improve export pipeline to include detailed answer-level exports (not only submission headers) for downstream analytics.
- [ ] Add data retention/backup policy for survey databases and token lifecycle cleanup job (expired token purge).
- [ ] Add environment-driven configuration documentation (`PORT`, `API_BASE`, `VITE_API_URL`, CORS origin list).
- [ ] Resolve documentation drift: several docs still reference LowDB/JSON while runtime uses sql.js SQLite.
- [ ] Decide on and document migration plan for legacy JS server files (`server/server.js`, `server/database.js`) to avoid accidental use.
- [ ] Add info text to Question ID 30.
- [ ] Identify possible pilot PSAPs for testing and feedback.

## Low Priority

- [ ] Add optional responder-facing progress indicator enhancements (section and completion percentage).
- [ ] Evaluate admin/reporting dashboard for DuckDB outputs and trend analysis.
- [ ] Evaluate archival strategy for old survey versions and cross-version analytics harmonization.

## Completed

- [x] Debounced auto-save implemented with retry and offline queue support.
- [x] Server-side progress persistence implemented (`current_section_index`, `last_question_id`).
- [x] Resume token issue/consume API implemented with one-time token semantics.
- [x] Resume via URL parameters implemented (`?id=` and `?t=`).
- [x] Question 29 "Other (Please Specify)" now supports positive numeric input validation.

## Notes

- Deployment readiness currently depends most on backend validation, security hardening, and test coverage.
- DuckDB integration should be designed first as a data model decision (source-of-truth and sync direction) before coding.
- User-facing save/return is partially complete technically, but needs explicit code-entry UI and respondent instructions.

## Save Feature Workflow

### Already Implemented ✓

1. **Auto-save** - Answers save automatically as users type (500ms debounce)
2. **Database storage** - All answers stored with submission ID
3. **Retrieval API** - Backend endpoint to fetch saved submissions exists
4. **Offline support** - Queues saves when offline and syncs later
5. **Server progress tracking** - Section index and last question are persisted
6. **Token resume support** - One-time resume tokens can route to target version/section

### What's Missing for Full Resume Support

#### Easy Changes (30-60 min)

1. **Resume entry UI** - Add visible field/button to enter resume code or submission ID
2. **Responder guidance** - Add plain-language instructions for save/return process
3. **Validation messaging** - Add clear error states for invalid/expired/used resume codes

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

The core persistence path is done. Remaining work is primarily respondent-facing resume UX, validation/security hardening, and deployment readiness tasks.
