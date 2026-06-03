# Security Evaluation — NENA 9‑1‑1 Survey Application

**Reviewer:** Jason Jeffares
**Date:** 2026-06-03
**Scope:** Full application — Express/TypeScript API (`server/`), SQLite (`sql.js`) + DuckDB data layer, React/Vite frontend (`src/`), build artifacts, and deployment documentation.
**Method:** Manual source review (read-only; no source files were modified) plus `npm audit`.
**Intended deployment target:** `server/server.ts` (per `deploy.txt`, which runs `npm run build:server`).

---

## Executive summary

The application has a solid *defensive coding* foundation — parameterized SQL, strong schema-driven input validation, good resume-token hygiene, and (in `server.ts`) helmet/CORS/rate-limit/body-limit middleware.

However, **there is no authentication or authorization anywhere in the application.** Every API endpoint is reachable by any anonymous client. For a nationwide tool collecting 9‑1‑1 center staffing and call-handling data — i.e., operational-capacity intelligence about emergency-services infrastructure — this is the dominant risk and the source of most findings below.

A secondary theme is **deployment hygiene**: a stale, wide-open compiled server is committed to the repo, the deployment docs describe an older insecure stack, and the file the docs call "critical data" is not git-ignored.

### Findings at a glance

| ID | Severity | Finding | Primary location |
|----|----------|---------|------------------|
| C1 | 🔴 Critical | No authN/authZ — all collected data publicly readable (incl. IDOR + bulk export) | `server/server.ts` read/analytics routes |
| H1 | 🟠 High | Unauthenticated writes enable mass dataset poisoning | `server/server.ts:147,167,212` |
| H2 | 🟠 High | Open email relay + Host-header phishing via token issuance | `server/server.ts:279–342` |
| H3 | 🟠 High | Stale, wide-open compiled server committed (`server/dist/`) | `server/dist/server.js:11` |
| H4 | 🟠 High | Deploy docs describe legacy insecure stack; DB file not git-ignored | `deploy.txt`, `SETUP_AND_RUN.txt`, `.gitignore` |
| M1 | 🟡 Medium | Unauthenticated, expensive analytics refresh (DoS) | `server/server.ts:409` |
| M2 | 🟡 Medium | `sql.js` full-file synchronous persistence (availability / corruption) | `server/db.ts:117` |
| M3 | 🟡 Medium | Rate limiter ineffective behind reverse proxy (`trust proxy` unset) | `server/server.ts` |
| M4 | 🟡 Medium | Vulnerable dependencies (1 high, 3 moderate) | `package.json` / lockfile |
| M5 | 🟡 Medium | Resume token exposed in URL + email body | `server/database.ts:272` |
| L1 | 🟢 Low | Server filesystem path disclosed via `/api/analytics/health` | `server/analytics.ts:459` |
| L2 | 🟢 Low | Non-atomic token consume (TOCTOU) — latent for async DB migration | `server/database.ts:330` |
| L3 | 🟢 Low | Ensure `NODE_ENV=production` so stack traces aren't leaked | `server/server.ts:419` |
| L4 | 🟢 Low | Latent CSV formula injection if answer text is added to export | `server/server.ts:252` |

---

## 🔴 Critical

### C1 — All collected survey data is publicly readable (no authentication/authorization)

**Locations**
- `server/server.ts:240` — `GET /api/submissions` (lists every submission ID + metadata)
- `server/server.ts:225` — `GET /api/submissions/:submissionId` (returns full answers — **IDOR**)
- `server/server.ts:252` — `GET /api/export/csv` (bulk export)
- `server/server.ts:387` — `GET /api/analytics/completed-surveys` (full per-submission answers, wide format)
- `server/server.ts:399` — `GET /api/analytics/kpis`
- `server/server.ts:377` — `GET /api/analytics/health`
- `src/App.tsx:6` — the analytics dashboard is exposed in-browser by a plain `?view=dashboard` query param

**Description**
No endpoint checks credentials. One unauthenticated request to `/api/analytics/completed-surveys` returns every completed survey's full answer payload. Independently, `GET /api/submissions` enumerates all submission IDs, and `GET /api/submissions/:id` returns that submission's answers — a textbook **Insecure Direct Object Reference**. The IDs are not secrets: they are minted client-side at `src/components/SurveyForm.tsx:207` as `` `survey_${Date.now()}_${Math.random().toString(36).substr(2,9)}` `` — a predictable timestamp prefix plus non-cryptographic randomness.

**Impact**
Complete, anonymous disclosure of the entire national dataset: which PSAPs are understaffed, shift minimums, call volumes, answer times, governance. This is sensitive critical-infrastructure operational data; exposure is a real-world safety/security concern, not only a privacy one.

**Important nuance for the fix:** `GET /api/submissions/:id` is *also* used legitimately by respondents to resume their own survey (`src/components/SurveyForm.tsx:101,133,174`, after token consume or from `localStorage`). So it **cannot simply be admin-gated** without breaking resume. The list/export/analytics endpoints, however, are purely administrative and can be gated immediately.

#### Fix — Part 1 (drop-in): admin gate for administrative endpoints

Add a bearer-token admin gate and apply it to the list, export, and analytics routes. This eliminates bulk read and ID enumeration with no impact on respondents.

In `server/server.ts`, add near the top:

```ts
import crypto from 'crypto';

const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function requireAdmin(req: Request, res: Response, next: express.NextFunction): void {
  // Fail closed: if no admin token is configured, deny all admin access.
  if (!ADMIN_API_TOKEN) {
    res.status(503).json({ error: 'Admin API is not configured' });
    return;
  }
  const header = req.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  const provided = m?.[1]?.trim() ?? '';
  if (!provided || !timingSafeEqualStr(provided, ADMIN_API_TOKEN)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
```

Then insert `requireAdmin` as the first handler on each administrative route:

```ts
app.get(`${API_BASE}/api/submissions`, requireAdmin, async (req, res) => { /* ... */ });
app.get(`${API_BASE}/api/export/csv`, requireAdmin, async (req, res) => { /* ... */ });
app.get(`${API_BASE}/api/analytics/health`, requireAdmin, async (req, res) => { /* ... */ });
app.get(`${API_BASE}/api/analytics/completed-surveys`, requireAdmin, async (req, res) => { /* ... */ });
app.get(`${API_BASE}/api/analytics/kpis`, requireAdmin, async (req, res) => { /* ... */ });
app.post(`${API_BASE}/api/analytics/refresh`, requireAdmin, async (req, res) => { /* ... */ }); // also resolves M1
```

Generate the secret with `openssl rand -base64 32` and supply it as `ADMIN_API_TOKEN` in the server environment.

> **Frontend implication (do not skip):** the analytics dashboard (`src/components/AnalyticsDashboard.tsx` via `src/services/surveyService.ts`) currently calls these endpoints with no credentials, and it ships in the *public* SPA bundle. **Do not bake the admin token into the frontend** — it would be world-readable. Instead, either (a) serve the dashboard from a separate, access-controlled deployment / internal-only host, or (b) add an admin login screen that accepts the token at runtime, keeps it in memory only, and sends it as the `Authorization: Bearer …` header. Until then, expect the dashboard to require the operator to paste the token.

#### Fix — Part 2 (structural): close the per-submission IDOR

`GET /api/submissions/:id` must stay reachable by respondents, so the goal is to make *knowing the ID* equivalent to *being authorized*. Two complementary changes:

1. **Generate submission IDs server-side as high-entropy capabilities.** Have `POST /api/submissions` mint the ID and return it, instead of trusting the client's value.

   In `server/database.ts` (or the route), replace client-supplied IDs with:
   ```ts
   import crypto from 'crypto';
   const submissionId = crypto.randomBytes(32).toString('base64url'); // unguessable
   ```
   In `server/server.ts:147`, ignore any client `submissionId` and return the generated one in the response. Update `src/components/SurveyForm.tsx:207` to use the server-returned ID instead of `Date.now()/Math.random()`, and store *that* in `localStorage`. With the list endpoint now admin-gated (Part 1) and IDs unguessable, enumeration and guessing are both closed.

2. **(Preferred, optional) Bind resume reads to the token.** Return the answer payload directly from `POST /api/tokens/consume` so the resume flow never needs an unauthenticated by-ID read, then make `GET /api/submissions/:id` admin-only as well. This is the cleanest end state but requires a small refactor of the consume response + `SurveyForm` resume path.

---

## 🟠 High

### H1 — Unauthenticated writes enable mass dataset poisoning

**Locations:** `server/server.ts:147` (create), `:167` (answers), `:212` (complete), `:195` (progress).

**Description**
All write endpoints are anonymous. An attacker can script unlimited submissions, populate schema-valid answers, and mark them complete — and completed submissions flow straight into analytics (`server/server.ts:216` → `syncCompletedSurveyDataframe()`). The integrity of the national dataset is the entire point of the tool, and nothing prevents large-scale ballot-stuffing. Note also that `/complete` and `/progress` do **not** validate the `submissionId` format that `/submissions` and `/answers` do.

**Fix**
- Add a bot/abuse barrier on `POST /api/submissions` (and optionally `/answers`): CAPTCHA / Cloudflare Turnstile, or a one-submission-per-invite model (server-issued submission token tied to a known PSAP).
- Apply a stricter per-IP rate limit to the write routes (the global 300/15-min limiter is generous; see M3 — it must also actually work behind the proxy).
- Validate `submissionId` consistently on **all** routes using the existing pattern:
  ```ts
  if (typeof submissionId !== 'string' || !/^[\w-]{1,128}$/.test(submissionId)) {
    res.status(400).json({ error: 'Invalid submissionId' });
    return;
  }
  ```

### H2 — Open email relay + Host-header phishing via token issuance

**Location:** `server/server.ts:279–342`, specifically the link built at `:312`:
```ts
const resumeLink = `${req.protocol}://${req.get('host')}${result.resumeUrl}`;
```

**Description**
`POST /api/tokens/issue` sends an email to an attacker-supplied `resumeEmail`, and the link host is taken from the client-controlled `Host` header. An attacker can therefore (a) send unsolicited "NENA Survey" emails to arbitrary recipients from your legitimate `SMTP_FROM` (email bombing / sender-reputation damage), and (b) make those emails contain a link to an **attacker-controlled domain** — a credible phishing lure carried by your trusted sender. The only throttle is the global limiter, which is weak here and likely misconfigured behind a proxy (M3).

**Fix**
1. Build the link from a server-configured base URL, never from the `Host` header:
   ```ts
   const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL; // e.g. https://survey.example.gov/survey
   // ...
   const base = (PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
   const resumeLink = `${base}${result.resumeUrl}`;
   ```
   (If `PUBLIC_BASE_URL` is unset, log a warning and either skip the email or use a safe default — do not fall back to the `Host` header.)
2. Add a strict, dedicated limiter on the issue route (per IP and ideally per recipient):
   ```ts
   const emailIssueLimiter = rateLimit({
     windowMs: 60 * 60 * 1000, // 1 hour
     max: 5,
     standardHeaders: true,
     legacyHeaders: false,
     message: { error: 'Too many save-code requests. Please try again later.' },
   });
   app.post(`${API_BASE}/api/tokens/issue`, emailIssueLimiter, async (req, res) => { /* ... */ });
   ```
3. Optionally require the caller to prove ownership of `sourceSubmissionId` before any email is sent.

### H3 — Stale, wide-open compiled server is committed (`server/dist/`)

**Location:** `server/dist/server.js:11–12`:
```js
app.use(cors());         // all origins
app.use(express.json()); // no explicit body limit
// no helmet, no rate limiter, no CORS restriction, no x-powered-by disable
```

**Description**
The hardened middleware exists only in `server.ts`. The compiled `server/dist/` checked into the repo is an **older snapshot** that still exposes the token and analytics endpoints but is missing all security middleware. Because it is runnable output sitting in the tree (and the docs are ambiguous about what actually runs — see H4), there is a real risk the deployed process is this insecure build.

**Fix**
```bash
git rm -r --cached server/dist
echo "server/dist/" >> .gitignore
```
Build fresh at deploy time (`npm run build:server`). Build artifacts should never be committed.

### H4 — Deployment docs describe the legacy insecure stack; DB file is not git-ignored

**Locations:** `SETUP_AND_RUN.txt`, `deploy.txt`, `server/server.js` (legacy: `app.use(cors())`, lowdb, zero validation), `.gitignore`.

**Description**
The docs still present `server/server.js` + lowdb + `server/survey_responses.json` as the system, and instruct operators to "keep `server/survey_responses.json` … (critical data)." Following them deploys the wide-open legacy server. Separately, `.gitignore` excludes `*.db` and `server/survey_responses.db` but **not** `server/survey_responses.json`, which is currently tracked (27 test submissions today). If anyone reverts to the lowdb path, **real respondent data would be committed into the repository.**

**Fix**
- Rewrite `deploy.txt` / `SETUP_AND_RUN.txt` to describe the actual TS server and the required env vars: `ADMIN_API_TOKEN`, `CORS_ALLOWED_ORIGINS`, `PUBLIC_BASE_URL`, `SMTP_*`, `NODE_ENV=production`, and HTTPS termination.
- Delete the legacy files: `git rm server/server.js server/database.js`.
- Git-ignore and purge the tracked DB file:
  ```bash
  printf 'server/survey_responses.json\n*.db\n*.db-journal\n' >> .gitignore
  git rm --cached server/survey_responses.json
  ```

---

## 🟡 Medium

### M1 — Unauthenticated, expensive analytics refresh (DoS)

**Location:** `server/server.ts:409` — `POST /api/analytics/refresh`.
Triggers a full ELT: `DELETE` + rebuild of all DuckDB tables and a full re-scan of SQLite (`server/analytics.ts:247`). Cheap to spam, expensive to serve.
**Fix:** gate with `requireAdmin` (see C1); debounce/queue so concurrent refreshes coalesce.

### M2 — `sql.js` full-file synchronous persistence (availability / corruption)

**Location:** `server/db.ts:117` — `persist()` does a synchronous `writeFileSync` of the **entire** database on *every* answer save, blocking the single-threaded event loop, with no atomic rename (a crash mid-write can corrupt the file).
**Impact:** at nationwide concurrency this is an availability problem and a soft DoS.
**Fix:** migrate to `better-sqlite3` or Postgres before launch (the data layer is already structured for a drop-in adapter swap — see the migration notes in `server/database.ts` and `server/db.ts`). Interim: write atomically (temp file + `rename`) and batch persists.

### M3 — Rate limiter ineffective behind a reverse proxy

**Location:** `server/server.ts` — `trust proxy` is never set, yet subfolder hosting (`API_BASE=/survey`) implies a reverse proxy. `express-rate-limit` then keys on the *proxy's* IP, so all clients share one bucket: attackers aren't isolated and legitimate users can be collectively throttled.
**Fix:** in `createApp`, before the routes:
```ts
app.set('trust proxy', 1); // set to the actual number of trusted proxy hops
```
Then verify `req.ip` reflects the real client IP in your deployment topology. (Setting an explicit hop count rather than `true` avoids spoofable `X-Forwarded-For`.)

### M4 — Vulnerable dependencies

`npm audit` (production deps): **1 high** — `path-to-regexp` ReDoS (GHSA-37ch-88jc-xwx2); **3 moderate** — `qs` DoS via Express 4.x. Total: 4 vulnerabilities.
**Fix:** `npm audit fix` (and re-test); consider bumping Express. Add `npm audit` to CI so regressions are caught.

### M5 — Resume token exposed in URL and email body

**Location:** `server/database.ts:272` — `resumeUrl: \`/?t=${rawToken}\``, plus the token in the plaintext email (`server/email.ts`).
URL tokens leak via `Referer`, browser history, and proxy/server logs. Mitigated by single-use + 7-day expiry, but avoidable.
**Fix:** strip `?t=` from the address bar client-side immediately after consumption (`history.replaceState`); consider a POST-based redemption form rather than a GET link.

---

## 🟢 Low / Hardening

### L1 — Server filesystem path disclosure
`server/analytics.ts:459` returns the absolute `duckdbPath` in `/api/analytics/health`. Largely mitigated once health is admin-gated (C1), but drop the absolute path from the response on principle of least information.

### L2 — Non-atomic token consume (TOCTOU)
`server/database.ts:330` does SELECT-then-UPDATE without atomicity. Safe under synchronous `sql.js`, but it becomes a **double-redeem race** if migrated to an async driver (which the code explicitly anticipates). Use a conditional update and check rows affected:
```ts
db.run(
  `UPDATE resume_tokens SET status='consumed', consumed_at=?
   WHERE token_hash=? AND status='issued'`,
  [now, tokenHash],
);
if (db.getRowsModified() === 0) return null; // already consumed / lost the race
```

### L3 — Ensure production error handling
Confirm `NODE_ENV=production` in prod so Express's default error handler doesn't emit stack traces. The custom handler at `server/server.ts:419` only catches the CORS error and delegates everything else to Express's default.

### L4 — Latent CSV formula injection
`server/server.ts:252` currently exports only IDs/dates (safe), but the "can be enhanced" comment is a trap. If answer text is ever added, prefix-guard any cell beginning with `=`, `+`, `-`, or `@` (e.g., prepend `'`) so spreadsheet apps don't execute it as a formula.

---

## What's already done well (preserve this)

- **Parameterized SQL throughout** `server/database.ts` — no SQL injection. DuckDB identifiers are quoted/escaped (`server/analytics.ts:17`) and the analytics `LIMIT` is bound and clamped (`:428`).
- **Strong server-side answer validation** `server/answerValidator.ts` — schema-driven, enum-constrained, HTML-stripped, range-checked, and it rejects unknown question IDs.
- **Good resume-token hygiene** — 256-bit entropy, only the SHA-256 hash stored, single-use, expiry, and deliberately generic failure responses (`server/database.ts:239–376`).
- **`server.ts` middleware** — helmet, restricted CORS, rate limiting, body-size limits, `x-powered-by` disabled. The right foundation; it simply needs the authorization layer and must be the code that actually ships.

---

## Recommended remediation order

1. **Authentication/authorization** on all read/export/analytics endpoints + the IDOR fix (C1) and the analytics-refresh gate (M1).
2. **Lock down email/token issuance** (H2) and **add a write-abuse barrier** (H1).
3. **Fix the deploy story:** remove `server/dist/` and legacy `server.js`/`database.js`, git-ignore + purge the DB JSON, rewrite docs, set `trust proxy`, `npm audit fix` (H3, H4, M3, M4).
4. **Pre-launch reliability:** migrate off `sql.js` full-file persistence (M2).
5. **Hardening pass:** M5 + all Low items.

### Required production environment variables (after fixes)

| Variable | Purpose |
|----------|---------|
| `ADMIN_API_TOKEN` | Bearer secret gating admin/read/analytics endpoints (C1) |
| `PUBLIC_BASE_URL` | Canonical base for resume links — replaces `Host` header (H2) |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins (already supported) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Email delivery (already supported) |
| `NODE_ENV=production` | Suppress stack-trace leakage (L3) |

---

## Notes & limitations

- This was a static, read-only review; no source files were modified and no exploits were run against a live instance.
- Findings reference `server/server.ts` as the production target per `deploy.txt`. If a different entry point is actually deployed (e.g., the committed `server/dist/server.js` or the legacy `server/server.js`), the posture is **worse** than described — see H3/H4.
- The committed `server/survey_responses.json` currently holds only test data (27 incomplete submissions, empty answers). The concern is the pattern/precedent for production, not the present contents.

*End of evaluation.*
