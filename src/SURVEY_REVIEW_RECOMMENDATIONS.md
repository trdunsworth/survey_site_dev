# PSAP Survey — Content & Data Review Recommendations

**Prepared:** 2026-10-14
**Last updated:** 2026-10-15
**Scope:** `src/data/survey_data.json`, `src/data/glossary_data.json`
**Inputs reviewed:**
- `src/data/Consider if certain information is obtai.md`
- `src/data/JCM_Chat_Wednesday_20260916.docx` (JCM working-group chat, 2026-09-16)
- `src/data/JCM Data Collection Session Notes.docx` (data collection working-group session)

**Status:** Items **#1** (validator drift) and **#2** (events → incidents) are **RESOLVED**. Glossary definitions have been **aligned to the NENA Knowledge Base** (see §25). All other items are recommendations only; no further content changes have been made to `survey_data.json`.

---

## Change log

Work is tracked in named passes. Each pass is listed with the items it closed, the files it touched, and its verification.

| Pass | Date | Items | Files changed | Verified | Committed |
|---|---|---|---|---|---|
| **1** — Validator alignment | 2026-10-14 | #1 | `server/answerValidator.ts`, `src/components/Question.tsx`, `server/answerValidator.test.ts` | 43 → **95 tests passing** | ✅ `c07e487` |
| **2** — Terminology pass | 2026-10-14 | #2 | `src/data/survey_data.json` | JSON parses; no validator change required | ✅ `07a7f00` |
| **3** — NENA KB glossary alignment | 2026-10-15 | §25 (aligns with #18, #19, #21) | `src/data/glossary_data.json` | JSON parses; **95/95 tests passing** | ✅ `dd17a6e` |
| **4** — Snapshot removal | 2026-10-15 | hygiene | **deleted** `src/data/survey_data_20260311.json`; `src/components/SurveyForm.tsx` | **95/95 tests passing**; no dangling refs | ✅ `1874630` |
| **5** — Static rebuild | 2026-10-15 | hygiene | `static/` — new bundle, `index.html` repointed | Bundle verified free of snapshot | ✅ `5fcda39` |
| **6** — Build gates | 2026-10-15 | infra | `tsconfig.json`, `server/*`, 2 test files | **Both gates 0 errors**; 95/95 tests | ✅ `a65d045` |
| **7** — Q22 numeric | 2026-10-15 | #3 | `src/data/survey_data.json`, `server/answerValidator.ts`, `server/answerValidator.test.ts` | **Both gates 0 errors**; 96/96 tests; validator probed across 8 inputs | ✅ `37148a1` |
| **8** — Static rebuild (Q22) | 2026-10-15 | hygiene | `static/` — new bundle, `index.html` repointed | Bundle rebuilt for the numeric input change | ✅ `7c01169` |
| **9** — Q7 examination | 2026-10-15 | #5 | doc only | Examination recorded; no code change | ✅ `4e00591` |
| **10** — Q6/Q7 resolution | 2026-10-15 | #5 | `src/data/survey_data.json`, doc | **Both gates 0 errors**; 96/96 tests | ✅ `5450542` |
| **11** — Static rebuild (Q7) | 2026-10-15 | hygiene | `static/` | Bundle rebuilt for the textarea change | ✅ `0a54df9` |
| **12** — Unknown affordance | 2026-10-15 | #4 (partial) | `survey_data.json`, `Question.tsx`, `types`, `answerValidator.ts` + test | **Both gates 0 errors**; **100/100 tests**; drift guard verified to fail on mismatch | ⏳ pending |

### Pass detail

**Pass 1 — validator drift (#1).** Committed as `c07e487`. Full resolution notes at the end of §1.

**Pass 2 — terminology (#2).** Q16–Q21 changed `events` → `incidents`, and Q21's grammar defect ("Total number other events…") was corrected in the same edit. This was a **text-only** change: no question ID, `type`, or `options` value was touched, so `server/answerValidator.ts` correctly required no matching change — the atomic-unit rule in §1 was satisfied vacuously.

**Pass 3 — NENA KB glossary alignment.** Definitions for 10 of 14 glossary entries were replaced with verbatim NENA Knowledge Base text. Full detail, including the NENA-vs-local split, at §25.

**Pass 4 — snapshot removal.** Deleted the unused 99-question versioning snapshot and removed its `SURVEY_VERSIONS` entry. The snapshot had been shipped in `static/assets/index-Dil3VMbM.js` since `5e37918` (2026-09-10), contrary to the "never deployed" assumption — unreachable, but present. Full detail at §2.

**Pass 5 — static rebuild.** Regenerated `static/` so the deleted snapshot no longer ships.

**Pass 6 — build gates.** Fixed both broken TypeScript gates, which had left `npm run start:prod` undeployable. Details at §26.

**Pass 7 — Q22 numeric (#3).** `text` → `number`, wording aligned with Q23, and "Estimated" retained as an explicit qualifier rather than deleted. Enabled the Q22↔Q23 consistency check. Details at §3.

**Pass 8 — Q7 examination (#5).** No code change. The recommendation was examined and found weaker than stated; disposition recorded at §5.

**Pass 9 — Q6/Q7 resolution (#5).** Q7's scope moved into the question text and aligned to Q6's full option set; the divergent description clause was removed; `text` → `textarea`; Q6's `operaations` typo fixed. Item closed.

**Pass 10 — "Unknown" affordance (#4, partial).** Q20, Q22, Q40 → `number-or-unknown` with an explicit Unknown checkbox. Also fixed a pre-existing `''` → `0` coercion affecting all 33 `number` questions. Details at §4.

**Item 4 is now partial, not deferred** — the mechanism ships for three questions; the semantics decision (open question 4) remains open.

### ✅ All passes committed — working tree clean as of 2026-10-15

Six commits on `main`, each independently revertable. Kept separate so review is not buried under deploy-artifact churn (Pass 5 swaps a 224 kB bundle).

---

## How to read this document

| Marker | Meaning |
|---|---|
| ✅ **DONE** | Implemented and verified. Section carries a resolution note. |
| 🟡 **PARTIAL** | Some sub-items resolved; remainder still open. Section carries a status note. |
| 🔴 **BLOCKER** | Data loss / unanswerable questions. Fix before fielding. |
| 🟠 **HIGH** | Changes the meaning or usability of collected data. |
| 🟡 **MEDIUM** | Ambiguity explicitly raised in a working-group session. |
| 🔵 **POLISH** | Copy edits, consistency, low risk. |
| ⚖️ **DECISION** | Requires a human decision, not a code change. |
| 📌 | Tied to a specific working-group participant or the `.md` review note |

Every recommendation cites its source so the working group can verify intent before you commit to it.

> ⚠️ **On numbering.** The summary table's row numbers and the section heading numbers **diverge from row 10 onward** — a pre-existing defect. The summary table has 24 rows; the sections run 1–24 sequentially but not in the same order (summary row 10 "Outgoing calls" is section 16; summary row 15 "Dates" is section 10, and so on).
>
> **Section headings are authoritative.** This document cross-references by **heading number**. When you see "§7" it means the section headed `# 🟠 7.`, not summary row 7. Renumbering the summary table to match would be a clean follow-up, but must not be done piecemeal — it would invalidate every existing cross-reference in the text.

---

## Summary

| # | Area | Recommendation | Priority | Status | Source |
|---|---|---|---|---|---|
| 1 | Validator drift | ~~10 questions rejected server-side~~ | ✅ DONE | ✅ **DONE** (2026-10-14) | Code audit |
| 2 | Data hygiene | ~~"events" → "incidents" (Q16–Q21)~~ | 🟠 HIGH | ✅ **DONE** (2026-10-14) | Gary (NENA CRC) |
| 3 | Data hygiene | ~~Q22 `text` → `number`~~ | 🟠 HIGH | ✅ **DONE** (2026-10-15) — "Estimated" kept as a qualifier | Review note L2 |
| 4 | Data hygiene | Add "Not available / Don't know" escape hatch | 🟠 HIGH | 🟡 **PARTIAL** — "Unknown" added to Q20/Q22/Q40 (Pass 10); semantics still open | Review note L1, Daniel Hagan |
| 5 | Structure | ~~Q7 duplicates Q9~~ | 🟠 HIGH | ✅ **DONE** (2026-10-15) — overlap closed via Q7 text scoping | Brian Bond |
| 6 | Structure | Transfers: warm/cold, internal/external, reason, NA | 🟠 HIGH | ⬜ Open | Sandy Dyre, Sam Bard, Burt Ray, Daniel |
| 7 | Definitions | Q36–Q39 processing-time boundary | 🟠 HIGH | ⬜ Open — see §25 | Heather, Crystal, Justin |
| 8 | Definitions | Shift/staffing work-year denominator (2,080 vs 2,184) | 🟠 HIGH | ⬜ Open | Gary, Rebecca Conners |
| 9 | Definitions | "Optimum" / "fully staffed" undefined | 🟠 HIGH | ⬜ Open | Barry Hutchins |
| 10 | Coverage | Outgoing calls unmeasured | 🟡 MEDIUM | ⬜ Open | Crystal, Ernie Qualls |
| 11 | Coverage | Non-emergency vs. administrative conflated | 🟡 MEDIUM | ⬜ Open | Crystal |
| 12 | Coverage | Q4 add colleges/universities | 🟡 MEDIUM | ⬜ Open | Session notes L17, Joel McDonald |
| 13 | Coverage | Q3 peak population escape hatch | 🟡 MEDIUM | ⬜ Open | Brian Bond (AZ) |
| 14 | Coverage | Q6 "Call Taking" too generic | 🟡 MEDIUM | ⬜ Open | Sam Bard |
| 15 | Dates | Reference year unspecified; **deadline already passed** | 🟠 HIGH | ⬜ Open | Review note L3 |
| 16 | Fieldwork | Duplicate-response guardrails + PSAP identifier | ⚖️ DECISION | ⬜ Open | Review note L5, Brian Bond, Tony |
| 17 | Fieldwork | Incentives / return of answers | ⚖️ DECISION | ⬜ Open | Review note L6, Session notes L34 |
| 18 | Glossary | Dead, broken, and unmatched terms | 🟠 HIGH | 🟡 **PARTIAL** — see §25 | Code audit |
| 19 | Glossary | ~13 missing terms | 🟠 HIGH | 🟡 **PARTIAL** — see §25 | Cross-referenced |
| 20 | Glossary | Tooltips don't render in `description` / `data_location` | 🟠 HIGH | ⬜ Open | `Question.tsx` audit |
| 21 | Glossary | Plurals never match tooltips | 🟠 HIGH | ⬜ Open — **regression, see §25** | `Question.tsx` audit |
| 22 | Glossary | Definition rewrites (FTE, CAD, PSAP, 10-Digit) | 🟡 MEDIUM | 🟡 **PARTIAL** — see §25 | Working group |
| 23 | Polish | Typos, double-space, centre/center | 🔵 POLISH | ⬜ Open | Code audit |
| 24 | Polish | Survey length budget | ⚖️ DECISION | ⬜ Open | Chet Ripka, Rick Erickson |
| 25 | Glossary | NENA KB alignment + provenance metadata | 🟠 HIGH | 🟡 **PARTIAL** — see §25 | NENA KB, 2026-10-15 |
| 26 | Infrastructure | TypeScript build gates (both were broken) | 🔴 BLOCKER | ✅ **DONE 2026-10-15** | Code audit |

---

# 🔴 1. BLOCKER — `answerValidator.ts` is out of sync with `survey_data.json`

## Problem

`server/answerValidator.ts` still uses the **previous question numbering**. `POST /api/answers` validates every answer and returns HTTP 400 on failure (`server/server.ts:177`). The client discards the server's explanation and raises a generic error instead (`src/services/surveyService.ts:285`):

```ts
if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
}
```

**Net effect: respondents enter valid answers that are silently never persisted.**

## Verified impact

Every question ID was parsed from both files and compared:

| ID | Question (current text) | `survey_data.json` | Validator expects | Result |
|---|---|---|---|---|
| 20 | NCIC transactions | `number` | `text` | ❌ Rejected — "Answer must be a string" |
| 22 | Estimated radio keyups | `text` | `number`, integer | ❌ Rejected — non-numeric text fails |
| 29 | Optimum Telecommunicator FTEs | `number` | `radio` (shift length) | ❌ Rejected — "not a valid option" |
| 31 | Length of shifts | `radio` | `number` | ❌ Rejected — "must be a finite number" |
| 39 | Avg processing, non-emergency | `number` | `info` | ❌ Rejected — "cannot be submitted for info sections" |
| 40 | Calls handled per TCT FTE per hour | `number` | *absent* | ❌ Rejected — "Unknown question ID" |
| 41 | Avg time to transfer a call | `number` | *absent* | ❌ Rejected — "Unknown question ID" |
| 42 | Avg processing, law enforcement | `number` | *absent* | ❌ Rejected — "Unknown question ID" |
| 43 | Avg processing, fire | `number` | *absent* | ❌ Rejected — "Unknown question ID" |
| 44 | Avg processing, EMS | `number` | *absent* | ❌ Rejected — "Unknown question ID" |
| 0.1, 0.2, 45 | Info blocks | `info` | *absent* | ⚠️ Low risk — no answer is posted |

**10 of the 45 gradable questions cannot be saved** (the survey declares 49 questions in total: 4 are `info` blocks that accept no input, leaving 45 that a respondent can actually answer). This includes every service-specific processing-time question — the data most directly relevant to staffing models.

## Secondary drift (currently type-compatible, but wrong)

These store incorrect semantics or clip legitimate values:

- `'34'` / `'35'` — capped at **3,600**, the seconds-range cap. These IDs are now *maximum FTE per shift*.
- `'38'` — capped at **1,000**. That cap belongs to *calls per TCT per hour*; ID 38 is now average processing time in seconds. An EMS pre-arrival call can legitimately exceed 1,000s.
- `'21'` — capped at **100,000**; now "other events not previously covered."

## Compounding client-side issue

`src/components/Question.tsx:14`:

```ts
const NUMERIC_OTHER_QUESTION_IDS = new Set(['29', 29]);
```

ID 29 is now an FTE number. Shift length is **31**, so its "Other" box renders as free text — and a numeric entry like `14` would fail `otherIsNumeric` validation regardless.

## Recommendation

Treat `survey_data.json` and `answerValidator.ts` as a **single atomic unit**. Every change in this document that adds, removes, or renumbers a question must land in:

1. `src/data/survey_data.json`
2. `server/answerValidator.ts` (`QUESTION_SCHEMA`)
3. `src/components/Question.tsx` (`NUMERIC_OTHER_QUESTION_IDS`, if affected)

The `answerValidator.ts` header comment already documents this contract (lines 17–19). It was not followed when the numbering changed.

### 🛠 Suggested guard

Add an automated check that diffs the ID sets between `survey_data.json` and `QUESTION_SCHEMA` and fails on any of:

- ID present in survey, absent from schema
- `kind` mismatch with question `type`
- Option-set mismatch between `survey_data.json` and the validator's `s([...])`

A ~40-line script wired into CI would have caught this before fielding. Note that `showIf.anyOf` string values are also duplicated between the two files and should be compared.

## ✅ Resolution — implemented 2026-10-14

All 49 questions (45 gradable + 4 `info`) now validate. Three files changed:

**`server/answerValidator.ts`**
- Info entries corrected to `0`, `0.1`, `0.2`, `45` (was `0` and `39`)
- `20` NCIC transactions → `number`, int, 0–100,000,000 (was `text`)
- `21` other incidents → `number`, int, 0–100,000,000 (was 0–100,000)
- `22` radio keyups → `text` (was `number`)
- `23` avg keyups/hour → `number`, float, 0–100,000 (unchanged)
- `24`, `25` transferred calls → raised to 0–100,000,000 (was 0–10,000)
- `29` optimum TCT FTEs → `number`, int (was `radio`)
- `31` shift length → `radio` with `otherIsNumeric` (was `number`)
- `34`, `35` max FTE per shift → 0–10,000, `integerOnly` (was capped 0–3,600 as seconds)
- `38`, `39` processing time → 0–3,600 (was 0–1,000)
- `40` calls per TCT/hour → added, 0–1,000 float
- `41` transfer time → added, 0–3,600 float
- `42`, `43`, `44` LE/fire/EMS processing → added, 0–3,600 float

**`src/components/Question.tsx`** — `NUMERIC_OTHER_QUESTION_IDS` corrected `'29'` → `'31'`, so the shift-length "Other" box renders as a number field.

**`server/answerValidator.test.ts`** — added a regression guard that walks every question in `survey_data.json`, probes it with a type-appropriate value, and asserts the validator both knows the ID and agrees with its declared type. Verified it fails on the original bug:

```
question 29 declared "number" but was rejected: "1" is not a valid option
```

Test suite: **43 → 95 passing.**

> **Note on Q42–44 ceilings:** capped at 3,600s (1 hour), consistent with the existing answer-time convention. The working group noted some centers keep a telecommunicator on the line through pre-arrival, which could push averages higher. Raise these three caps if real responses start getting rejected.

---

# 🟠 2. "Events" → "Incidents" (Q16–Q21)

📌 **Source:** Session notes L24 — Raymond Horner asked about the choice; Gary confirmed:

> *"incidents is a NENA term while events is not. This will be changed"*

Six questions use "events". Suggested edits:

| ID | Current | Suggested |
|---|---|---|
| 16 | Total number of Law Enforcement **events** processed… | …Law Enforcement **incidents** processed… |
| 17 | Total number of Fire **events** processed… | …Fire **incidents** processed… |
| 18 | Total number of EMS **events** processed… | …EMS **incidents** processed… |
| 19 | Total number of other **events** processed… | …other **incidents** processed… |
| 20 | …NCIC transactions… | *(unaffected)* |
| 21 | Total number other **events** not previously covered in this survey in the last calendar year. | Fix grammar **and** term: *"Total number of **other incidents** not covered elsewhere in this survey."* |

> **Note:** Q21 currently reads *"Total number other events not previously covered…"* — missing "of". Worth correcting in the same pass.

**Terminology check:** confirm the NENA-preferred spelling is "incident" (singular) in CAD reporting contexts, and whether "CAD incident" vs. "CAD event" is resolved in the NENA Data Model.

## ✅ Resolution — implemented 2026-10-14 (Pass 2)

All five applicable questions updated in `src/data/survey_data.json`:

| ID | Before | After |
|---|---|---|
| 16 | Total number of Law Enforcement **events** processed… | …Law Enforcement **incidents** processed… |
| 17 | Total number of Fire **events** processed… | …Fire **incidents** processed… |
| 18 | Total number of EMS **events** processed… | …EMS **incidents** processed… |
| 19 | Total number of other **events** processed… | …other **incidents** processed… |
| 21 | Total number other events not previously covered in this survey in the last calendar year. | Total number **of** other **incidents** not covered **elsewhere** in this survey in the last calendar year: |

Q21 received three corrections in one edit: the missing "of", the term change, and "not previously covered" → "not covered elsewhere". A trailing period was normalised to a colon to match the other four questions in the block.

**Validator impact: none required.** This was a text-only edit. No question ID, `type`, or `options` value changed, so `server/answerValidator.ts` correctly needed no matching edit — the atomic-unit rule in §1 was satisfied without action.

### Terminology check — closed 2026-10-15

**Confirmed.** The NENA KB defines *Incident* as *"A real-world occurrence, or event, for which one or more calls may be received."* (NENA-STA-010, NENA-REQ-001, NENA-INF-021). Gary's instruction is consistent with NENA's own usage, and "incident" is the established CAD reporting term.

> 📌 **This has a data-collection consequence worth stating explicitly.** NENA's definition is *not* "one incident = one CAD record" — one incident may generate **multiple calls**. Respondents reading Q16–Q19 need to count **incidents**, not calls, or the incident totals will silently disagree with the call totals in Q11–Q15. Consider whether `responseEmphasis` should say so.

### Two "event" strings deliberately NOT changed

| Location | String | Why left alone |
|---|---|---|
| `survey_data.json` Q4 + `answerValidator.ts:181` | `"Event Peaks"` | This is a **population-variation factor** — community events driving call volume — not a dispatched incident. Different sense of the word. Gary's instruction applies to Q16–Q21 only. **Do not "correct" this.** |
| ~~`survey_data_20260311.json`~~ | "…Law Enforcement **events** processed…" | **DELETED 2026-10-15.** A 99-question versioning snapshot, never fielded. Removed from source and from `SURVEY_VERSIONS`. See Pass 4 below. |

---

## ✅ Resolution — Pass 4, 2026-10-15 — snapshot removal

`src/data/survey_data_20260311.json` deleted. Two files changed.

**`src/components/SurveyForm.tsx`** — import removed; the `20260311` key removed from `SURVEY_VERSIONS`. The versioning mechanism itself was **kept**, not removed, because it is load-bearing:

- `server/db.ts:45` — `survey_version` column, `NOT NULL DEFAULT 'default'`
- `server/db.ts:75` — `target_survey_version` on the resume-token table
- `SurveyForm.tsx:59` — `SURVEY_VERSIONS[surveyVersion] ?? SURVEY_VERSIONS['default']`
- `AnalyticsDashboard.tsx:97` — "Survey Versions" counts distinct values

**Adding a future snapshot is now a two-step operation:** drop the JSON beside `survey_data.json`, add one line to `SURVEY_VERSIONS`.

### ✅ Safe by construction — verified

| Property | Finding |
|---|---|
| Unknown version key | Falls back to `'default'` at `SurveyForm.tsx:59`. No crash for a submission or token still carrying `20260311`. |
| Server allowlist | **None.** `server.ts:151` only type-checks `surveyVersion` as a string; `survey_version` is free-text with `DEFAULT 'default'`. No migration needed. |
| DB rows | None to migrate — no deployed submission carries the key. |

### ⚠️ The snapshot *was* in a committed build — now removed

The snapshot's content was present in the committed deploy bundle. `"99 question"` — a string unique to the snapshot — was found in `static/assets/index-Dil3VMbM.js`.

**This contradicts the assumption that it was never deployed.** It was never *reachable* through normal navigation (no URL parameter selects a version; reaching it required a submission or token already tagged `20260311`), but it **was shipped** in the static bundle as of `5e37918`, 2026-09-10.

#### ✅ Bundles rebuilt 2026-10-15

| Artifact | Tracked? | Action | Result |
|---|---|---|---|
| `static/assets/index-Dil3VMbM.js` | ✅ tracked | `npm run build:static` | **Deleted** — replaced by `index-p0F_8VOI.js` |
| `static/index.html` | ✅ tracked | rebuilt | Repointed to the new hash |
| `static/assets/index-p0F_8VOI.js` | new | created | Verified clean: no `"99 question"`, no `20260311` |
| `dist/` | ❌ **gitignored** (`.gitignore:10`) | `npx vite build` | Regenerated locally only — never a tracked artifact |

> 📌 **Correction to an earlier note in this document:** `dist/` was initially described as a tracked bundle. It is not — `.gitignore:10` excludes it. **`static/` is the only tracked deploy artifact**, and it is now clean.

#### ✅ Build gates fixed 2026-10-15 (Pass 6, commit `a65d045`)

Both TypeScript gates were failing, which meant `npm run start:prod` (`build:server && server:prod`) could not deploy. See §26 for the full resolution.

| Gate | Before | After |
|---|---|---|
| `npm run build` (`tsc && vite build`) | **37 errors** | ✅ **0** |
| `npm run build:server` (`tsc -p server/tsconfig.json`) | **27 errors** | ✅ **0** |

---

# 🟠 3. Q22 is `text`, Q23 is `number` — make both numeric

📌 **Source:** Review note L2 — *"Several questions use the term 'estimate.' Consider removing to obtain actual data."*

**Q22** is the only free-text number in the entire call-count block:

```json
{
  "id": 22,
  "text": "Estimated radio keyups in the last calendar year:",
  "type": "text"
}
```

**Recommendations:**
- Change `type` to `number`
- Remove "Estimated" from the text
- Align wording with Q23, which is already `number`

> ⚠️ **Constraint:** if radio logs cannot produce an exact yearly total, do **not** force a hard number. Pair this with recommendation #4 below — a "Not available" option is the correct fallback. Forcing a fabricated integer is worse than an honest blank.

Also confirm the validator's `integerOnly` setting for Q22 — radio keyup counts are large integers, but the yearly maximum may exceed the current 100,000,000 cap.

---

# 🟠 4. Add a "Not available / Don't know" escape hatch

📌 **Sources:** Review note L1 — *"Consider if certain information is obtainable by most Comm Centers"*; Daniel Hagan on transfers — *"null/zero and NA all causing separate results."*

This is the single most important **analytical** fix in the survey. Right now a blank answer is ambiguous — it conflates:

| Blank could mean | Should be recorded as |
|---|---|
| Service not provided | `0` or not-applicable |
| Data exists but wasn't retrieved | missing (incomplete) |
| Doesn't exist at any source | "Not available" |
| Genuinely unknown | "Don't know" |

**Recommendation:** for questions with a difficult or external data source — Q20 (NCIC), Q22 (radio keyups), Q40 (calls per TCT per hour) — add an explicit negative-response control rather than relying on empty input.

### 🛠 Implementation notes

The current UI has no "N/A" affordance. Adding one requires:
- A new `type` (e.g. `number-or-na`) or an adjacent radio group in `Question.tsx`
- A matching `kind` in `answerValidator.ts` — `validateNumber` currently coerces with `Number(raw)`, so `"N/A"` yields `NaN` and fails as *"must be a finite number"*
- A sentinel value in the analytics pipeline (DuckDB / MotherDuck) distinct from `NULL`

**Alternative, lower effort:** keep the numeric input but add a single checkbox per question — *"I cannot access this data."* Less elegant, far smaller change surface.

> **Recommendation:** agree on the analytical convention first (what each state means in the dataset), then choose the UI. Implementing the control without deciding the semantics just moves the ambiguity downstream.

## 🟡 Partial resolution — implemented 2026-10-15 (Pass 10)

An explicit **"Unknown"** affordance added to **Q20, Q22, Q40** — the three questions named in this section. Narrower than originally proposed, by decision.

### What respondents see

A number input plus a checkbox labelled `Unknown`. Ticking the box disables the number field and stores the label as the answer.

### Four distinguishable states, verified

| Respondent does | Stored | Meaning |
|---|---|---|
| Types a figure | `"87600"` | The figure |
| Types `0` | `"0"` | Genuinely zero |
| Ticks **Unknown** | `"Unknown"` | Positive statement: the centre does not know |
| Leaves blank | `null` | Not offered / skipped / not applicable |

This is the distinction this section asked for: **zero is a value, Unknown is a statement, and blank is the absence of an answer.**

### Implementation

| File | Change |
|---|---|
| `src/types/index.ts` | `Question.unknownOption?: string` |
| `src/data/survey_data.json` | Q20, Q22, Q40 → `type: "number-or-unknown"`, `unknownOption: "Unknown"` |
| `src/components/Question.tsx` | New `number-or-unknown` render case |
| `server/answerValidator.ts` | New `number-or-unknown` kind, `UNKNOWN_VALUE` sentinel, `NumericBounds` extraction, dispatch case |
| `server/answerValidator.test.ts` | `probeFor` case; per-question sentinel suite |

### 🛠 Storage: no migration needed

`database.saveResponse` stores `JSON.stringify(answer)` — the **raw posted value**. Numeric inputs therefore *already* persist as JSON strings (`"87600"`), so a string sentinel is **shape-consistent with existing data**. Wide-table columns are `JSON` (`analytics.ts`), so the pivot is unaffected.

`answerType()` classifies by JS type, so the sentinel surfaces as `'string'` in `kpi_answer_type_mix` — Unknown responses become countable per question without extra work.

### ⚠️ A pre-existing bug found and fixed

Probing revealed that **`''` validated to `0`** — on all 33 `number` questions, not just these three. `Number('') === 0`, so a respondent who typed a value and then backspaced it out had **a real zero recorded in its place**.

This mattered more once the Unknown box existed, because **unchecking posts an empty string** — a routine action that would have written a zero.

Fix in `validateNumber`: an empty or whitespace-only string now returns `sanitized: null`, matching the existing `null`/`undefined` "clear this answer" path.

```ts
if (typeof raw === 'string' && raw.trim() === '') {
    return { valid: true, sanitized: null };
}
```

### Drift guard

`answerValidator.test.ts` asserts every `number-or-unknown` question's `unknownOption` equals `UNKNOWN_VALUE`, and that the sentinel is accepted while near-misses are not. **Verified to fail** when the JSON is changed to `"Not sure"` — 3 tests fail.

### ⚠️ What this does *not* decide

The table at the top of this section lists **four** distinct meanings for a non-answer. This implements one of them.

| State | Meaning | Handled? |
|---|---|---|
| Service not provided | `0` or not-applicable | ✅ explicit `0` |
| Data exists but wasn't retrieved | missing (incomplete) | ❌ still collapses to blank |
| Doesn't exist at any source | "Not available" | ❌ **same as Unknown** |
| Genuinely unknown | "Don't know" | ✅ **Unknown** |

⚠️ **"Unknown" currently conflates "I don't know this figure" with "this figure doesn't exist at our centre."** Both are plausible readings of the same checkbox. If the working group needs them separated, the sentinel becomes a second option — the mechanism is now in place, and the storage shape will not need to change again.

### Open question 4 — narrowed, not closed

Still asks what each blank means. This narrows it to: **should "Unknown" split into "Unknown" and "Not applicable"?**

---

# 🟠 5. Q7 duplicates Q9

📌 **Source:** Brian Bond — *"Question Number 7 may be a duplicate, list any additional services that you provide, duplicate to question 9. Could you define question 7 so the two questions does not overlap or duplicated 7 and 9."*

| ID | Question | Asks about |
|---|---|---|
| 6 | What services does the PSAP provide? | Service categories (Call Taking, Dispatching, Walk Up, SMS/Text) |
| 7 | Please list any additional services that you provide | Service categories, free text |
| 9 | What agencies does the PSAP answer calls and dispatch for and how many of each? | **Agency types** and counts |

Q7 and Q6 are genuinely redundant. Q7's description claims *"beyond calltaking and dispatching"*, but respondents read it alongside Q9 and answer agency names.

**Options:**
1. **Delete Q7**, and extend Q6 with an "Other (Please Specify)" option
2. **Keep Q7**, reframe as *"Which non-call-taking, non-dispatch functions does your center perform?"* (e.g. mobile crisis, evidence room, alerts management)
3. **Move Q7 after Q9**, so respondents have already answered the agency question

> **Recommendation:** option 2. Roxy VanGundy described dispatching mobile crisis — real work that no current question captures. Option 1 loses that signal.

## 🔬 Examination 2026-10-15 — recommendation weakened, issue re-identified

**Disposition: HOLD.** No change made to Q7. This item needs working-group input, not a code fix.

### Verified current state

| ID | Question | Type | Actually asks |
|---|---|---|---|
| 6 | What services does the PSAP provide | `checkbox` | Service categories — Call Taking, Dispatching, Walk Up, SMS/Text. **No "Other" option** |
| 7 | Please list any additional services that you provide | `text` | Service categories, free text |
| 9 | What agencies does the PSAP answer calls and dispatch for and how many of each | `agencies-with-count` | **Agency types + counts** — Police, Fire, EMS, Sheriff, Animal Control, Other |

### Four challenges to the recommendation as written

**1. It misattributes Brian's concern.** Brian wrote *"duplicate to question 9."* This recommendation concludes *"Q7 and Q6 are genuinely redundant."* Different claims — and the recommendation's own table contradicts Brian, showing Q9 as *agency types* and Q7 as *service categories*. Brian's observation is silently substituted with another.

**2. Brian reported behaviour, not structure.** *"duplicate to question 9"* describes what respondents **do** — answer Q7 with agency names. This converts a field observation into a structural claim and then acts on the structural claim. **Brian's actual observation is never tested or addressed by any of the three options.**

**3. The central claim is wrong as written.** Q6 has **no "Other (Please Specify)" option**, so Q7 is Q6's *only* overflow path. It is load-bearing, not redundant. Option 1 below ("extend Q6 with an Other") concedes this and contradicts the summary sentence.

**4. The disambiguation Brian asked for already exists.** He asked *"Could you define question 7 so the two questions does not overlap."* Q7's description already reads *"what services **beyond calltaking and dispatching** that you provide."* That is the definition requested. The recommendation dismisses it via an unsourced assertion that *"respondents read it alongside Q9"* — but **Q7 is separated from Q9 by Q8 and Q8.1**, and no data is cited.

### A real defect the recommendation missed

**Q7 says "list" and is collected through a single-line input.**

`type: "text"` renders at `Question.tsx:300–308` as `<input type="text">` — one line, no Enter key — for a question asking for a *list*.

> 📌 **`textarea` is fully implemented at `Question.tsx:91–99` and used by zero questions.** The 49 current questions are 33 `number`, 4 `checkbox`, 4 `info`, 3 `radio`, 3 `select`, 1 `agencies-with-count`, 1 `text`.

Switching Q7 to `textarea` is **client-only** — the validator checks the posted *value*, not the widget, so `'7'` stays `kind: 'text'`. The schema-coverage guard maps unrecognised types to `'probe'` and would still pass.

### Assessment of the three options

| Option | Verdict |
|---|---|
| **1.** Delete Q7, add Other to Q6 | Mechanically fine, analytically inert. Requires editing Q6's validator option set per §1. Moves the problem; does not solve it. |
| **2.** Reframe as "non-call-taking, non-dispatch functions" | Closest to Brian's ask — but the description already says this, so the change is cosmetic tightening. |
| **3.** Move Q7 after Q9 | Addresses the *behavioural* claim, but does so speculatively. If the confusion is semantic rather than positional, relocation changes nothing. |

### Working-group questions before any change

1. **Settle the referent.** Did Brian observe Q7 duplicating **Q9**, or **Q6**? The recommendation acts on Q6 without confirming that.
2. **Source the observation.** Was *"respondents answer agency names"* a single report, or a pattern across responses? Is there response data behind it?
3. **Is Q7 still wanted?** If the working group wants it constrained to a checkbox list, the candidate services must be supplied — Roxy's mobile crisis plus evidence room, alerts management, and others. That is a scope decision with a length-budget implication (§24), not a copy edit.
4. **Separate from the wording.** The `textarea` defect is verifiable from the code today and does not depend on answers to 1–3. Worth landing on its own merits if the group is comfortable with a list box.

### 📌 Adjacent, already logged

Q6's description contained *"operaations"* — the §23 typo, one question away. Fixed in Pass 9.

## ✅ Resolution — implemented 2026-10-15 (Pass 9)

Item **#5 is closed.** Q7's scope is now defined in a single field, and the input control matches what the question asks for.

**`src/data/survey_data.json`** — four edits across Q6 and Q7:

| ID | Field | Before | After |
|---|---|---|---|
| 6 | `description` | *"…may influence **operaations** and staffing."* | *"…may influence **operations** and staffing."* |
| 7 | `text` | *"Please list any additional services that you provide:"* | *"Please list any additional services that you provide **beyond the options listed in question 6**:"* |
| 7 | `description` | *"We would like to know what services **beyond calltaking and dispatching that you provide** to understand…"* | *"We would like to know what services you provide to understand…"* |
| 7 | `type` | `"text"` | `"textarea"` |

### Why this closes the item

**Brian's ask was to define Q7 so the questions do not overlap.** That is now done — and it is done in the question text, which is where a respondent reads it first.

The scoping also **diverged mid-pass**. When the text was rescoped to *"beyond the options listed in question 6"* (all four Q6 options), the untouched description still said *"beyond calltaking and dispatching"* (only two). **Walk Up** and **SMS/Text** were therefore covered by the text but not the description — a PSAP providing those two without call-taking or dispatching would have been told not to repeat them and then invited to repeat them. Removing the redundant clause from the description resolved that; **the scope is now carried by one field only.**

> 📌 **The divergent phrasing was the problem, not the shared rationale.** Q6 and Q7 now carry the same rationale clause — they are two halves of one construct, so that is appropriate.

### Defect fixed

`type: "textarea"` resolves the mismatch between *"please **list**"* and a single-line `<input type="text">`. This uses the `textarea` control already implemented at `Question.tsx:91–99`, which until now was **used by zero of the 49 questions**.

### Validator: no change required, and none made

Per §1's atomic rule, a `type` change normally requires a matching `answerValidator.ts` edit. **This one does not** — the validator checks the posted *value*, not the widget, so `'7'` correctly stays `kind: 'text'`. Probed directly:

| Payload | Result |
|---|---|
| multi-line textarea (239 chars) | ✅ ACCEPT |
| short string | ✅ ACCEPT |
| empty string | ✅ ACCEPT |

The schema-coverage guard maps unrecognised types to `'probe'` via its `default:` branch, so `textarea` passes without a guard change.

### 📌 Brian's original framing, recorded for accuracy

Brian's note said Q7 duplicates **Q9**. The examination established that the recommendation's own table contradicted this — Q9 asks for agency types, Q7 for services. The overlap that actually existed was **Q6↔Q7**, and that is what has been closed. The Q9 observation was never independently confirmed; if agency names appear in Q7 responses, that is a new finding rather than an unclosed part of this item.

### Verification

- JSON parses; 49 questions
- **96/96 tests passing**; both TypeScript gates **0 errors**
- Scope conflict resolved — the description no longer names any excluded option

---

# 🟠 6. Transfers need structure

📌 **Four separate participants raised this.**

| Participant | Concern |
|---|---|
| Sandy Dyre (NENA) | Distinguish **warm transfer** (PSAP remains engaged) from **cold transfer** (e.g. jails) — they have very different workload implications |
| Sam Bard (Motorola) | Capture the **reason**: jurisdiction/location-based vs. another agency (EMS, highway patrol) |
| Burt Ray Simpson | Ask for **internal vs. external** transfers |
| Daniel Hagan | Null / zero / NA must be distinguishable, or results diverge |

**Current state:** Q24 and Q25 capture only two totals.

```json
{ "id": 24, "text": "How many calls were transferred in the last calendar year?" }
{ "id": 25, "text": "Of the calls transferred, how many were transferred to a secondary PSAP?" }
```

**Suggested restructure:**

```
24. Calls transferred in [YEAR] — internal (within your center)
25. Calls transferred in [YEAR] — external (to another PSAP or agency)
26. Of external transfers, how many were to a secondary PSAP?
27. Of external transfers, primary reason: [ ] Jurisdiction/location  [ ] Agency capability
    (EMS, highway patrol, etc.)  [ ] No answer available  [ ] Other (Please Specify)
```

> ⚠️ **Length caution:** this adds ~2 questions. See #24 on the length budget.

---

# 🟠 7. Processing-time boundary (Q36–Q39)

📌 **The most consequential definitional issue in the survey.**

The chain of clarification across the session:

- **Heather:** *"a cleaner definition to note the call being answered to dispatchable"*
- **Crystal:** *"Call processing = Talk time + wrap up"*
- **Justin Prahar:** *"That's 'Average Talk Time'"*
- **Sharon Koch:** *"call duration is another possible for that talk time part"*

Current text says **"From answer to dispatch."** That is a materially different boundary than *answer → dispatchable*, and neither matches *talk time + wrap-up*.

**These are not interchangeable.** Before fielding, agree on the exact interval and write it into the question text.

| Candidate definition | Measures |
|---|---|
| Answer → dispatch | Time to create the incident |
| Answer → **dispatchable** | Time until sufficient info to dispatch (Heather's preference) |
| Talk time + wrap-up | Full agent occupancy (Crystal's model) |
| Answer → **transfer** | Q41, already captured separately |

> **Recommendation:** if the intent is **agent occupancy** — which is what a staffing model needs — use Crystal's formulation. But note it requires wrap-up time to be measurable, which is not universal (see §20, Justin's question).

### 🛠 Second-order issue — NGCS measurement

📌 Pierre Foucault and Sam Bard flagged that answer time is hard to get consistently in NGCS:

- Pierre: *"issues with ACD and ring-all. Even hitting the PSAP demarc may not indicate an accurate ring/seconds count"*
- Sam Bard: *"there is a deeper chasm between the legacy SRs and IP"*
- Daniel Hagan: *"Keeping the questions technology neutral will improve the quality of time series analysis too... the INVITE to the CHE"*

**Recommendation:** ask the reporting technology as a **data point** (not as an explanatory question), so non-comparable measurements can be flagged in analysis. Daniel requested this — *"Would be interested to see PSAP's call provider type - i.e. LSR, NG system w/ gateway, native NG, RFAI, etc."* Consider deferring to a follow-up phase given length constraints.

---

# 🟠 8. Work-year denominator (Q26–Q35) — highest analytical value

📌 **Sources:** Gary Bell and Rebecca Conners raised this independently.

- Gary: *"Kate asked to better define length of shift, minimum staffing etc. Gary suggested going with hours per week, i.e. 5–8s (40) 3–10s (40) 12s with 2080 a years versus 2184"*
- Rebecca: *"a standard 8 hour work day - 40 hours is 2080 per year... a 12 hour pittman is 2184"*

| Convention | Hours/year | Typical schedule |
|---|---|---|
| Standard work year | 2,080 | 5 × 8-hour shifts |
| "Pittman" / 12-hour year | 2,184 | 182 days × 12 hours |

Crystal proposed a two-tier availability model:

> *"Annual contracted work hours would be what they are scheduled to work. Net Available work hours would subtract vacation, training, sick hour usage from the annual contracted hours"*

**Why this matters more than any other item in this document:** you cannot normalize FTE across PSAPs without agreeing on the denominator. A center on 2,184 and a center on 2,080 are not comparable at the raw FTE level. Every downstream staffing conclusion inherits this error.

**Recommendation — add one question, don't restructure the block:**

```
26. What work-year basis does your agency use for FTE calculation?
    [ ] 2,080 hours (2,080 / 1,728 = standard full-time)
    [ ] 2,184 hours (12-hour / "Pittman" schedule)
    [ ] Other (Please Specify): ____
```

Optionally, if schedule detail is needed, split contracted vs. net available hours — but that is 2 questions, so weigh against the length budget.

> **Verify:** confirm 2,184 is the correct figure for the schedule convention NENA intends to standardize on, and whether it should be stated as a derived value (182 × 12) or a flat constant.

## ✅ Resolution — implemented 2026-10-15 (Pass 7)

Q22 is now numeric. Three files changed, atomically per the §1 rule.

**`src/data/survey_data.json`**
- `text` → `"Total number of radio keyups in the last calendar year (an estimate is acceptable):"`
- `type`: `"text"` → `"number"`
- `data_location`: appended *"If your center does not record radio keyups, please leave this blank."*

**`server/answerValidator.ts`**
- `'22'`: `kind: 'text'` → `kind: 'number', min: 0, max: 100_000_000, integerOnly: true`
- Comment updated — it previously read *"estimated radio keyups (free text — see survey data)"*

**`server/answerValidator.test.ts`** — the Pass 1 test that asserted Q22 accepted free text was obsolete and was split into two: one covering Q22 numeric behaviour, one retaining the Q20 assertions.

### Why "Estimated" was not simply deleted

Three findings shaped this, all verified 2026-10-15.

**1. The `text` type was deliberate, not drift.** §1's Pass 1 did not *miss* Q22 — it **changed it from `number` to `text`**, and recorded that as the fix. The original validator comment read *"estimated radio keyups (free text — see survey data)"*. This recommendation therefore reverses a deliberate Pass 1 decision. 📌 **Worth confirming with whoever made that call before the next pass.**

**2. The payoff is a Q22↔Q23 consistency check.** The two questions are the same quantity at different time scales, so `Q22 ÷ 8,760 ≈ Q23`. Verified:

| Q22 total | Q22 ÷ 8760 | Q23 reported | Verdict |
|---|---|---|---|
| 8,760,000 | 1,000.0 | 1,000 | consistent |
| 17,520,000 | 2,000.0 | 2,000 | consistent |
| 8,760,000 | 1,000.0 | 10 | ⚠️ FLAG ×0.01 — daily read as hourly |
| 438,000 | 50.0 | 5,000 | ⚠️ FLAG ×100 — understated |

A ±20% band accommodates partial-year and seasonal skew. This check was impossible before, because `text` can hold *"about 2 million"*, *"unknown"*, and a typo'd *"2,000,000"* indistinguishably.

**3. ⚠️ The numeric change removes an accidental escape hatch — mitigated, not solved.** With `text`, a centre that cannot produce keyup data typed `"Not available"` and it was stored verbatim. With `number`, that answer is rejected (`"Answer must be a finite number"`). Confirmed by direct probe:

| Input | Result |
|---|---|
| `87600` | ✅ ACCEPT `87600` |
| `43800000` | ✅ ACCEPT `43800000` |
| `100000001` | ❌ REJECT — exceeds cap |
| `12.5` | ❌ REJECT — must be a whole number |
| `-5` | ❌ REJECT — must be at least 0 |
| `approx 2 million` | ❌ REJECT — must be a finite number |
| `N/A` | ❌ REJECT — must be a finite number |

**Mitigation:** the `data_location` now tells respondents to leave the field blank if they do not record keyups, and the question text keeps *"an estimate is acceptable"* rather than demanding precision the respondent may not have.

> ⚠️ **Open convention, deliberately local.** For Q22, **blank now means "not recorded / not available."** That is a per-field convention chosen here, not a survey-wide one. §4 remains the proper fix — a genuine escape hatch across all affected questions — and is still blocked on open question 4. Note that **no question in the survey is `required: true`**, so a blank was always possible; this change moves the failure mode from typed-honesty to silent-blank, it does not create a new one.

### Cap: 100M is correct, and the inconsistency runs the other way

§3 asked whether yearly totals might exceed the cap. Checked — they do not:

| Implied rate | Yearly total | Under 100M |
|---|---|---|
| 50 keyups/hr | 438,000 | ✅ |
| 2,000 keyups/hr | 17,520,000 | ✅ |
| 5,000 keyups/hr | 43,800,000 | ✅ |

100M/yr ≈ 11,400 keyups/hr sustained — generous but defensible for a large multi-jurisdiction centre.

> 📌 **The loose cap is Q23's, not Q22's.** Q23 is capped at 100,000/hour, which is **28 keyups per second sustained** — implausible. Its implied yearly maximum (876M) is 8.8× the Q22 cap, so the two ceilings are not derived from one another. Not changed here, but worth tightening: at ~10,000/hr the implied annual ceiling becomes 87.6M, which would sit consistently under Q22's 100M.

### Verification

- JSON parses; 49 questions; Q22 `type: "number"`
- Both TypeScript gates: **0 errors**
- **96/96 tests passing** (was 95 — the split test adds one)
- Validator behaviour probed directly across 8 inputs, tabulated above

### 🛠 Existing FTE questions to review

| ID | Question | Note |
|---|---|---|
| 26 | Number of **Funded Operational FTEs** | Description mentions both telecommunicator *and supervisor* positions |
| 27 | Number of Telecommunicator FTEs in use | |
| 28 | Number of Supervisor FTEs in use | |
| 29 | Optimum Telecommunicator FTEs | See #9 |
| 30 | Optimum Supervisor FTEs | See #9 |
| 31 | Length of shifts in hours | Validator expects `number` — see #1 |
| 32–35 | Min/max TCT and Supervisor FTEs per shift | |

📌 **Crystal:** *"Q24: Break down to Tele and supervisor as in the subsequent questions"* — note this comment refers to the **old numbering**. Under current numbering the analogous request applies to **Q26**.

📌 **Joel McDonald:** *"We have many casual employees as well, permanent part time, and job share."*

> **Consider:** does "FTE" include part-time and job-share staff? The glossary should state explicitly. Rebecca also asked: *"including backup?"*

---

# 🟠 9. "Optimum" and "fully staffed" are undefined

📌 **Source:** Barry Hutchins — *"some PSAPs have needed to increase shift hours over what was originally planned, due to staff shortages"*

```json
{ "id": 29, "text": "What is your optimum number of Telecommunicator FTEs (if fully staffed)?" }
```

**The problem:** where a center is understaffed, "optimum (if fully staffed)" collapses to "what I have now." That flattens precisely the variation the survey exists to measure — an understaffed center and a well-staffed center will report identical numbers.

**Recommendation — define in the `description` field:**

> *"The number of telecommunicator positions you believe your center needs to meet its service commitments, independent of your current budget or vacancies. If your center is currently fully staffed, this will equal your funded positions."*

Consider also asking **when** the response is measured — a rolling average vs. a point-in-time snapshot — since staffing fluctuates.

---

# 🟠 10. Dates — reference year and expired deadline

📌 **Source:** Review note L3 — *"Specify which calendar year (2025) to be clear. It may be useful to consider starting the survey in January to obtain more recent data (2026 v 2025), recognizing that a timeline does exist."*

## Problem A — the reference year is never stated

All **15 count questions** say "the last calendar year" without naming it:

```json
{ "id": 11, "text": "Total of 9-1-1 calls answered in the last calendar year:" }
```

With a 07/31/2026 deadline this unambiguously means CY2025 — but only if the reader does the arithmetic themselves. Ambiguity here corrupts the entire dataset silently.

**Recommendation:** name the year explicitly. Rather than editing 15 strings, add a single banner to the **Data Requirements** info block (Q0.1):

```
All volume and performance data should be reported for calendar year 2025
(January 1 – December 31, 2025).
```

Then optionally shorten each question to *"…in 2025:"* for reinforcement.

**On the January start:** the md notes a tension — starting in January yields CY2025 complete data (clean), but launches a full year after the intended cycle. Given the deadline problem below, this may be moot.

## Problem B — ⚠️ the stated deadline has already passed

**Q0 currently states: `"The deadline for completion is 07/31/2026."`**

**Today is 2026-10-14 — that deadline passed ~2.5 months ago.**

This needs resolution before any launch:

| Option | Implication |
|---|---|
| Update to a new deadline | Must be realistic for a 20–30 min survey with data gathering; Q20's `data_location` warns *"You may have to request this in advance of taking the survey"* |
| Was the date intentional and already lapsed? | Confirm with the working group — may indicate a delayed or abandoned launch |
| Was this a staging build? | Then align to the real target before publishing |

## Problem C — inconsistent survey naming

| Location | Name |
|---|---|
| `survey_data.json` → `title` | `"NENA Survey"` |
| Q45 closing text | `"NENA 2026 PSAP Survey"` |
| Q0 welcome text | `"conducting this survey"` (no name) |

**Recommendation:** pick one canonical name, use it in the title, the welcome, and the closing, and define a versioning convention.

---

# ⚖️ 11. DECISION — Duplicate-response guardrails

📌 **Source:** Review note L5 — *"Are there guardrails to keep the same agency from responding multiple times? If you use incentives, this would be important."*

## Current state

The only mitigation is textual, in Q0:

> *"\*\*\*Please coordinate within the center to ensure that there is only one response per PSAP\*\*\*"*

That is a request, not a control.

## The verification problem

📌 Brian Bond (AZ):

> *"How will NENA know how many PSAP's respond since there is only an FCC registry for Primary PSAP's that may not be really accurate? I did not locate a Canadian website with PSAP counts... **You may not be able to verify that two different dispatch supervisors did not answer the NENA survey.**"*

📌 Kate Pataran supplied the Canadian answer:

> *"we know how many primary and secondary agencies there are in Canada via the CRTC"*

📌 Tony (session notes L26): *"Rodger Marshall asked who would be responsible for completing this within the PSAP. Tony noted only one person per PSAP."*

## The privacy tension

Collecting a PSAP name or ID would make deduplication and response-rate tracking possible — but **Q0.2 currently promises**:

> *"The data will be aggregated and anonymized to ensure that **no specific PSAP can be identified** in any reports or publications resulting from this survey."*

Collecting an identifier does not have to violate that promise — publication anonymity and internal dedupe are different things — but **the current text does not distinguish them**, and adding an identifier without amending Q0.2 would make the privacy statement inaccurate.

## Recommendations

1. **Amend Q0.2** to distinguish *internal record-keeping* from *published output*, if an identifier is collected
2. **Capture a minimal identifier** — PSAP name plus contact email, held separately from answers
3. **Dedupe against known registries** — FCC (US), CRTC (Canada)
4. **Consider a completion code** — the existing *"Save & Get Code"* resume mechanism is a natural hook: the resume code could be tied to a PSAP identity

### 📌 Related IRB question — unresolved

Rebecca Conners asked: *"@Tony or April - will this be going through the IRB process?"*

No answer appears in either source document. **Confirm this before collecting any identifier**, since it affects both the privacy language and what may be retained.

---

# ⚖️ 12. DECISION — Incentives

📌 **Sources:** Review note L6; Session notes L34.

> Review note: *"Incentives are recommended - though this is a budgetary issue. If not this time, perhaps in the follow-up survey. Consider options other than \$\$ (free NENA shirt, conference registration, access to other NENA services for a period of time, etc.)"*

> Session notes L34: *"Incentives for PSAPs to complete the survey were discussed, such as **getting a printed return of your answers**, survey results and the need to ensure anonymity."*

## Recommendation

**Heather's option is the highest value per dollar: return the participant's own answers.**

- Requires no budget approval
- Directly reduces the disclosure fear that suppresses participation
- Creates a second engagement touchpoint (participant sees their data → becomes interested in the aggregate results)
- Reinforces the confidentiality promise in Q0.2, since it proves data is handled in aggregate

**Implementation note:** the "Save & Get Code" mechanism already exists — a returned-answers report can be generated from the same resume code at completion.

### 📌 Related — survey fatigue

📌 Brian Rosen: *"Would NENA maybe find ways to cut down on the number PSAP other survey's?"*

Overlapping NENA surveys are a participation-cost problem, not merely a contact problem. Worth mapping against the PSAP census effort starting in 2027 (session notes L14).

---

# 🟡 13. Q4 — Add colleges and universities

📌 **Sources:** Session notes L17; Joel McDonald — *"colleges and university towns also have a very transient population"*

```json
{ "id": 4, "text": "What are most common factors contiubting to the population variation? (Select all that apply)" }
```

**Add:** `"Educational Instability (College/University Population)"` as a distinct option from `"Seasonal Peaks"`.

> **Also fix:** `"contiubting"` → `"contributing"` (see #23)

---

# 🟡 14. Q3 — Peak population needs an escape hatch

📌 **Source:** Brian Bond (AZ) — *"US Census does not do a lot of good data for rural areas. **Recommend the survey just state I don't have a good source for peek population in the survey.**"*

Gary's suggested workaround: *"Do you have a Tourism or Business Bureau within your community. They can help to provide that information."*

**Recommendations:**
- Add `"No reliable source available"` to the Q3 option list, or a companion boolean
- Update Q3's `data_location` to mention the tourism/business bureau fallback
- Consider narrowing the bands — the current 8 bands span from "<10,000" to ">1,000,000", which is coarse for correlating with call volume

---

# 🟡 15. Q6 — "Call Taking" is too generic

📌 **Source:** Sam Bard — *"call taking is generic...... are they taking 911 calls, or PSTN calls, etc? Big difference"*

Ernie Qualls asked directly: *"for #10 do we want to consider RTT?"*

Options Q6 currently offers: `Call Taking`, `Dispatching`, `Walk Up`, `SMS/Text`

📌 Ernie Qualls: *"We do both Call taking and Dispatch"*
📌 Roxy VanGundy: *"We dispatch and answer calls for both"*

**Recommendation:** split call-taking into its actual channels, and consider the additions raised in session:

| Channel | Raised by |
|---|---|
| Real-Time Text (RTT) | Sandy Dyre |
| Video / telematics | Roxy VanGundy |
| Satellite SOS | Martin Michaud |
| Mobile crisis dispatch | Roxy VanGundy |
| Backup / mutual aid dispatch | Roxy VanGundy — *"I dispatch for 5 counties when they are down"* |

📌 **PCC / location data is a known confusion point.** Pete Eggimann's pursuit scenario and Brian Rosen's ownership explanation (line 64) show that **PCC/LVF data is routinely unavailable** — *"historically we see RFPs providing busy hour numbers (if we're lucky)"* (Daniel Hagan). Rebecca Conners: *"like my CAD has capabilities to get the spill, but we arent right now... we wont have it until we upgrade."*

This strongly reinforces recommendation **#4 (the "not available" control)** — if a question depends on PCC validation, expect a large share of non-responses.

---

# 🟡 16. Outgoing calls are unmeasured

📌 **Sources:** Crystal Lawrence and Ernie Qualls.

> Crystal: *"Good point Ernie, number of outgoing calls contributes to workload."*
>
> Ernie: *"We have to take a call then Call the State Trooper by phone. That is time consuming also."*

Outbound calls — callback,trooper notification, inter-PSAP — consume telecommunicator time but **no current question captures them**. Ernie's scenario (answer a call, then phone the trooper) is a direct workload multiplier invisible in the current dataset.

**Recommendation:** add a question, or fold into the existing call-count block:

```
Total outgoing calls placed by your center in [YEAR]
```

📌 Justin Prahar suggests a related metric — *"do you have a system-enforced 'wrap up time' between ACD calls, and if yes, what is the duration of the timer"* — which also consumes agent time.

---

# 🟡 17. Non-emergency vs. administrative conflation

📌 **Source:** Crystal — *"NCIC, after hours or primary for utilities, 9-1-1 v Admin calls"*

Current state:

| ID | Question | Issue |
|---|---|---|
| 13 | Total of all **non-emergency** calls | Mixes administrative, utility, and after-hours traffic |
| 37 | Average phone answer time for **non-emergency** calls | Compares against Q13, so it inherits the same ambiguity |
| 39 | Average call processing time for **non-emergency** calls | Same |

**Recommendation:** separate **administrative** from **non-emergency** into distinct lines, so processing times can be compared meaningfully. Administrative calls are typically faster and scripted — averaging them with non-emergency traffic produces a misleading number.

---

# 🟡 18. Q5 — Primary / Secondary definition

📌 **Source:** Sharon Koch — *"maybe include the definition of secondary if other places might call themselves something else?"*

Gary linked the NENA KB: `kb.nena.org/wiki/PSAP_(Public_Safety_Answering_Point)` and noted (session notes L20) *"Gary stated they want to keep the definitions within NENA Kb."*

📌 **Consistency constraint:** Session notes L18–21 show the working group deliberately aligned these questions with the **NENA EPRC**:

- L18–19 (Joel McDonald asked for broader primary/secondary definitions; April stated *"they want to keep that consistent with the NENA EPRC"*)
- L21 (April, on governance: *"noted again the need to keep consistent with the EPRC"*)

> ⚠️ **Recommendation:** define Primary/Secondary **by reference to the EPRC**, not by writing new definitions into the survey. Duplicating the definitions risks drift from the EPRC and creates a second source of truth. This respects Gary's stated position.

Q9 already contains a "secondary PSAP" reference (via Q25), so the distinction is load-bearing across the survey.

---

# 🟡 19. Glossary — `Question.tsx` matching constraints

📌 **Source:** Code audit of `src/components/Question.tsx:31–67`

Glossary terms are **not** hand-linked to questions. Tooltips are generated by regex:

```ts
const regex = new RegExp(`\\b(${term})\\b`, 'gi');
```

Three structural constraints limit what the glossary can do today. All were verified by running every current term against the full survey text.

## Constraint A — five terms never match anything

*Re-verified 2026-10-15 against the current survey text.*

| Term | Status | In NENA KB? |
|---|---|---|
| `CFAI` | Never appears in the survey | ❌ No |
| `APCO` | Never appears in the survey | ✅ Yes |
| `IAED` | Never appears in the survey | ❌ No |
| `NG9-1-1` | Never appears in the survey | ✅ Yes |
| `QA` | Never appears in the survey (split from `QA/QI`, 2026-10-15) | ✅ Yes |
| `QI` | Never appears in the survey (split from `QA/QI`, 2026-10-15) | ✅ Yes |

They are still shown in the Glossary panel, so they are not *wrong* — but they provide no in-context help. Note that three of these (`APCO`, `NG9-1-1`, `QA`/`QI`) are now NENA-sourced (§25), which makes them *more* likely to be worth keeping for future survey phases rather than less.

## Constraint B — one term is structurally broken

```json
{ "term": "Ten-Digit Emergency", "definition": "Emergency calls received on a standard 10-digit phone line rather than the 9-1-1 network." }
```

The survey uses **`10-digit emergency`** (Q10 option, Q12 question, Q10 `data_location`). The glossary term spells it **`Ten-Digit Emergency`** — spelled-out number *and* differing hyphenation. **It can never match.**

📌 This matters: Canadian and some US centers are significant users of 10-digit emergency lines, and this is one of the more consequential definitions in the survey.

> **Still open.** Deliberately untouched on 2026-10-15 — the NENA KB has **no entry** for this concept, so there is no authoritative text to sync to. Nearest KB relative is `AEAN (Alternate Emergency Access Number)`, which is a narrower VoIP-era construct and is *not* a general definition. Renaming the key to `10-Digit Emergency` still needs doing; sourcing its text needs a decision from the working group.

## Constraint C — plurals and possessives never match

The `\b` word boundary requires a non-word character after the term. `PSAPs` and `PSAP's` therefore get **no tooltip**.

*Match counts re-measured 2026-10-15: exact vs. exact-plus-optional-suffix.*

| Term | Exact matches today | Recoverable with suffix fix | Questions affected |
|---|---|---|---|
| `PSAP` | 22 | **27** (+5) | 6 |
| `FTE` | 2 | **11** (+9) | 9 |
| `SLA` | 0 | **3** (+3) | 3 |
| `Incident` | 0 | **5** (+5) | Q16–Q21 |

### ⚠️ `Incident` is a regression introduced by Pass 2

Before the events → incidents change, the survey read "Total number of Law Enforcement **events** processed", which did not match `Incident` either — so this was always broken. **But the fix direction has now flipped:** the term and the survey now agree on wording and disagree only on number.

| | Before Pass 2 | After Pass 2 |
|---|---|---|
| Survey text | "Law Enforcement **events**" | "Law Enforcement **incidents**" |
| Glossary term | `Incident` | `Incident` |
| Tooltip fires? | ❌ No — wrong word | ❌ No — plural |

📌 **`Incident` now has the correct term but still produces zero tooltips across all five questions that use it.** This is the highest-value single fix available in the glossary: the term is now right, and only the matcher stands in the way. Gary mandated this term for these questions — the tooltip that explains it should actually appear.

### 🛠 Recommended fix

Allow an optional suffix:

```ts
const regex = new RegExp(`\\b(${term})(?:['’]s|s)?\\b`, 'gi');
```

**⚠️ Two additional defects to fix in the same edit:**

1. **`term` is interpolated into a `RegExp` unescaped.** Every current term is metacharacter-clean (verified 2026-10-15 — no `.` `+` `*` `?` `(` `)` `[` `]` `{` `}` `|` `^` `$` `\`, and `/` is safe in a non-`RegExp` constructor). But any future term containing a metacharacter will either throw or silently mis-match. Add `escapeRegExp(term)`:

   ```ts
   const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   const regex = new RegExp(`\\b(${escaped})(?:['’]s|s)?\\b`, 'gi');
   ```

2. **The `segment.toLowerCase() === term.toLowerCase()` equality check at `Question.tsx:50` will break** once the regex can match a suffix. With a matched group of `"PSAPs"` the segment no longer equals `"PSAP"`, so the tooltip will not render even though the regex matched. The comparison must compare against the **capture group**, not the whole segment:

   ```ts
   const split = part.split(regex);       // odd indices are capture-group 1
   for (let i = 0; i < split.length; i++) {
       const segment = split[i];
       if (i % 2 === 1) {                 // was: segment.toLowerCase() === term.toLowerCase()
           newParts.push(<Tooltip key={...} text={definition}>{segment}</Tooltip>);
       } else {
           newParts.push(segment);
       }
   }
   ```

   > Without this, the "fix" silently does nothing and the tests will still pass — the tooltip count assertion would need to assert on rendered output, not just that `Tooltip` was constructed.

---

# 🔵 20. Glossary — missing terms

Terms used in the survey with **no glossary entry**, verified by cross-reference:

| Term | Used in | Why it matters | Source | Status |
|---|---|---|---|---|
| **Incident** | Q16–Q21 | Gary's mandated term; currently undefined | Session notes L24 | ✅ **CLOSED 2026-10-15** |
| **NCIC** | Q20, Q10 area | Q20 asks for transaction counts with no definition | Q20 | ⬜ Open |
| **Call processing time** | Q36–Q39 | The survey's core metric; boundary disputed (§7) | Heather, Crystal | ⬜ Open — blocked on §7 |
| **Wrap-up time** | processing metrics | Affects agent-occupancy models | Justin Prahar | ⬜ Open |
| **Radio keyup** | Q22, Q23 | Referenced without definition | Q22–Q23 | ⬜ Open |
| **Warm transfer / Cold transfer** | Q24, Q25, Q41 | Sandy raised the distinction; drives workload model | Sandy Dyre | ⬜ Open — blocked on §6 |
| **Work year (2,080 / 2,184)** | Q26–Q35 | Prerequisite for FTE normalization | Gary, Rebecca | ⬜ Open — blocked on §8 |
| **Contracted vs. Net Available Hours** | Q26–Q35 | Crystal's availability model | Crystal Lawrence | ⬜ Open — blocked on §8 |
| **Concurrent calls / Busy hour** | Q24-ish | The metric that actually drives NGCS cost | Daniel Hagan, Justin | ⬜ Open |
| **NGCS / ACD** | Q36, Q40 | Pierre's measurement caveats | Pierre Foucault, Sam Bard | ⬜ Open |
| **Backup center / Mutual Aid** | Q9, Q25 | Roxy dispatches for 5 down counties — not captured | Roxy VanGundy | ⬜ Open |
| **988 / RTT / Satellite SOS** | Q10 | Requested additions to call types | Sandy, Martin Michaud, Diane Dupar | ⬜ Open — blocked on §15 / length budget |
| **RFA / Call provider type** | Q36, Q40 | Needed for comparable time-series analysis | Daniel Hagan | ⬜ Open |

**Incident closed 2026-10-15** with the NENA KB definition — *"A real-world occurrence, or event, for which one or more calls may be received."* See §25. ⚠️ The entry exists but its tooltip still never fires (plural mismatch — §19 Constraint C).

> 📌 **Five of these have NENA KB equivalents** that could be sourced rather than drafted, consistent with Gary's position that definitions live in the KB. Verified present on 2026-10-15: `ACD (Automatic Call Distributor)`, `Busy Hour`, `Average Busy Hour`, `Call Handling`, `988`, `RTT (Real-Time Text)`, `Transfer`.
>
> **`NCIC`, `Radio keyup`, `Wrap-up time`, `Work year`, `Concurrent calls`, `Warm/Cold transfer`, `Contracted vs. Net Available Hours` and `RFA` have no KB entry** — those need working-group authorship, and several are blocked on open decisions elsewhere in this document.

---

# 🔵 21. Glossary — definition rewrites

*Status as of 2026-10-15. Superseded in part by §25 — read that section before acting.*

| Term | Original definition | Issue | Disposition |
|---|---|---|---|
| **FTE** | *"A unit that indicates the workload of an employed person"* | Too thin; omits the work-year basis and part-time/job-share treatment | ⬜ **OPEN** — no NENA KB entry exists. Blocked on §8 (2,080 vs 2,184) and the open question on part-time/job-share. Must be locally authored. |
| **CAD** | *"Computer Aided Dispatch. Systems used by dispatchers to track status and location of resources."* | Defines dispatch systems generally, not the **data source** that `data_location` fields depend on | ✅ **CLOSED** — NENA KB verbatim (§25) |
| **PSAP** | *"A facility equipped and staffed to receive 9-1-1 calls."* | No Primary/Secondary distinction | 🟡 **PARTIAL** — NENA KB verbatim applied (§25); Primary/Secondary remains open (§18) |
| **10-Digit Emergency** | Currently named `"Ten-Digit Emergency"` | Never matches (§19 Constraint B) | ⬜ **OPEN** — no NENA KB entry; needs both a key rename and locally authored text |
| **APCO** | *"Association of Public-Safety Communications Officials"* | ⚠️ Verify the official expansion — the hyphenation looks incorrect | ✅ **CLOSED** — hyphen confirmed incorrect, removed (§25) |

**Status on the "reserved terms" suggestion:** `CFAI`, `IAED`, `APCO`, `NG9-1-1`, `QA`/`QI` still match no question. The recommendation to hide or relocate them **stands but is deferred** — the NENA-sourced text makes them more defensible to keep for future survey phases, and the §20 restructure will change the panel anyway. Revisit once the missing terms land.

---

# 🔵 22. Glossary — tooltip field coverage

📌 **Source:** `Question.tsx` audit

Tooltips render in **`text`** and **`responseEmphasis`** only. They do **not** render in **`description`** or **`data_location`** — both render as plain text:

```tsx
{plainDescription && ( ... )}     {/* no tooltip processing */}
{data_location && ( ... )}        {/* no tooltip processing */}
```

**Why this is a problem:** `data_location` is where the CAD / phone-software guidance lives, and where measurement caveats would naturally go. Any definition placed there gets **no glossary support**.

**Recommendation:** route `description` and `data_location` through `renderTextWithTooltips` as well.

### 🗓️ Status 2026-10-15 — open, but now cheaper

Still open. It interacts with two completed passes:

- **§25 has landed** — the definitions that would populate these fields now exist and are NENA-authoritative. Do this step **after** §20 adds the missing terms, so the work is done once.
- **§19 Constraint C's matcher fix should land first.** `plainDescription` and `data_location` are both pre-stripped of HTML (`Question.tsx:23–29`) before rendering, so they are safe for the tooltip splitter. But if the plural fix lands afterward, those fields would be split by *two* different code paths and the capture-group bug would have to be fixed in both.

**Recommended order:** §19 Constraint C → §20 missing terms → **this step** → §25 provenance metadata.

> 📌 **Note on `description` specifically:** it is the field §8 uses to define the work-year basis and §9 uses to define "optimum." Both are open questions the working group still needs to answer. Routing `description` through tooltips makes any glossary term used in those new definitions clickable, which is the reason to do this before those edits land rather than after.

---

# 🔵 23. Polish — copy fixes

### Typos

| ID | Current | Correct |
|---|---|---|
| 4 | *"factors **contiubting** to the population variation"* | **contributing** |
| 8 | *"Miliary"* | **Military** |
| 6 | *"influence **operaations** and staffing"* | **operations** |

### ⚠️ Load-bearing double space — Q8

```json
"State Government  (LEO, Other)"
```

There are **two spaces** between `Government` and `(LEO`. This exact string appears in **three** places:

1. `survey_data.json` — Q8 option
2. `survey_data.json` — Q8 `showIf.anyOf`
3. `server/answerValidator.ts` — Q8 option set

Normalizing the whitespace will break `showIf` display logic and server-side validation. **Fix all three atomically**, and prefer a guard test.

### Centre vs. center — inconsistent spelling

| Spelling | Locations |
|---|---|
| **center** | Q29, Q30, Q32, Q33, Q36, Q37, Q40, Q45, and all `responseEmphasis` fields |
| **centre** | Q32 and Q33 **descriptions** |

Standardize on **center** for a US/Canadian survey with mixed spelling. Note that NENA's own style guide may govern — worth confirming.

### Other consistency notes

- 📌 **Sheriff / Provincial Police:** Kate Pataran noted *"Sheriff/Provincial Police"*; Roxy observed *"All law enforcement is considered part of the Police Service Boundary"* and *"Police in Data Model is the same as Sheriffs."* Q8.1 and Q9 both offer `Police` and `Sheriff` as separate options. Confirm these are intentional and distinguishable in the NENA Data Model.
- 📌 **Q31 response emphasis:** *"Please indicate the length of your base shifts. If you have multiple shift lengths, select the one that is most common."* — good pattern; consider extending to Q32–Q35, which use `responseEmphasis` but don't explain whether they mean *minimum ever scheduled* or *minimum for normal operations* (the current text says "normal operations").

---

# ⚖️ 24. DECISION — Survey length budget

📌 **Sources:** Chet Ripka and Rick Erickson.

> Chet: *"It was so long that the major feedback we were getting was that people would not fill it out"*
>
> Rick: *"It may be near that point now"*
>
> Chet: *"I am worried about turning people off by getting too granular"*
>
> Chet on scope: *"Part of the reason we split out admin/support staff is because of how many questions it added to the survey, including GIS for a later survey"*

**The tension:** recommendations in this document **add** questions — transfers (#6), outgoing calls (#16), work-year (#8), non-emergency split (#17), colleges (#13).

Q0 promises *"approximately 20 to 30 minutes."* With data gathering (Q0.1 lists six required data sources; Q20 warns *"You may have to request this in advance"*), this is likely optimistic already.

**Recommendation:**

1. **Set an explicit question budget** before implementing additions
2. **Rank by analytical value** — the work-year denominator (#8) and processing-time definition (#7) matter more than any individual call-count refinement
3. **Defer to a follow-up phase** where the analytical payoff is lower: call provider type, wrap-up time, 988/RTT/satellite channel expansion
4. **Re-time the survey** after changes and update Q0's estimate honestly — an underestimate costs more responses than a longer stated duration

---

# 🟠 25. Glossary — NENA Knowledge Base alignment

*Added 2026-10-15. Closes or advances #18, #19, #21.*

📌 **Source of authority:** [`kb.nena.org/wiki/Category:Glossary`](https://kb.nena.org/wiki/Category:Glossary) — **637 entries**. Session notes L20, Gary: *"they want to keep the definitions within NENA Kb."*

## Method

All 637 KB terms were extracted and diffed against the 13 local glossary entries. Result: **7 exact term matches**, **2 partial** (the KB structures the concept differently), **4 with no KB counterpart**. The 10 matching entries were then re-fetched individually via the MediaWiki API and their definitions replaced verbatim.

## What was applied (Pass 3)

| Term | NENA KB page | Substantive change |
|---|---|---|
| **PSAP** | `PSAP (Public Safety Answering Point)` | ⚠️ Now **"a physical or *virtual* entity"**; drops the unstated staffing requirement |
| **APCO** | `APCO (Association of Public Safety Communications Officials)` | ⚠️ Hyphen **removed** — "Public **Safety**", confirming the §21 suspicion |
| **Incident** | `Incident` | ⚠️ Redefined from a CAD record to a data-model-neutral occurrence — see §2 |
| **NG9-1-1** | `NG9-1-1 (Next Generation 9-1-1)` | Obsolete "initiative" framing → formal five-clause (A)–(E) system definition |
| **CAD** | `CAD (Computer-Aided Dispatch)` | Retargeted to telecommunicator automation; hyphenated "Computer-**Aided**" |
| **SLA** | `SLA (Service Level Agreement)` | Gains internal/external distinction and output-based framing |
| **NENA** | `NENA (National Emergency Number Association)` | Full organisational description, incl. "The 9-1-1 Association" |
| **TTY/TDD** | `TTY (Teletypewriter)` | NENA's full device definition; TDD demoted to a related-term pointer |
| **QA** | `QA (Quality Assurance)` | Split from `QA/QI`; NENA's process definition |
| **QI** | `QI (Quality Improvement)` | Split from `QA/QI`; NENA's system definition |

### 📌 Three findings that change respondent-facing meaning

1. **PSAP now says "virtual."** The old wording implied a staffed physical facility. NENA's definition admits a virtual PSAP — directly relevant to Canadian respondents and to any NG9-1-1 virtual-PSAP migration.
2. **Incident is no longer "one CAD record."** NENA's definition explicitly allows **multiple calls per incident**. Respondents must count incidents, not calls — see the note at §2, which is now a live data-quality risk for Q16–Q19.
3. **NG9-1-1 is a system, not an initiative.** The old text described a programme; NENA-STA-010 defines a technical system with five mandatory capabilities (A)–(E).

## Deliberately not changed

| Term | Reason |
|---|---|
| `CFAI` | No KB entry. Zero search hits across the entire wiki. |
| `IAED` | No KB entry. Zero search hits across the entire wiki. |
| `FTE` | No KB entry. Zero search hits — not even a "Full-Time Equivalent" page. Needs local authorship; blocked on §8. |
| `Ten-Digit Emergency` | No KB entry for the general concept. Nearest relative `AEAN (Alternate Emergency Access Number)` is a VoIP-specific construct and is **not** a general definition — unsuitable. |

> ⚠️ **`CFAI` and `IAED` are themselves suspect entries.** They are private accreditation bodies, not 9-1-1 terminology. Their absence from the KB is meaningful rather than an oversight. Recommend raising removal with the working group rather than retaining them (see §21).

## Verification (2026-10-15)

- JSON parses; **14 entries**; no duplicate `term` values
- **95/95 tests passing** — unchanged from Pass 1
- `tsc --noEmit`: **37 errors before and after** the change, all pre-existing vitest-typing noise in `.test` files; **zero in application code**
- Glossary match counts against survey text re-measured and recorded at §19

## 🛠 Provenance metadata — requirements

**Problem.** Ten of fourteen definitions are now copies of an external, living document. Nothing in the repo records *which* ones, *where* they came from, or *when* they were last checked. Three concrete consequences:

- A future sync cannot tell which entries are safe to overwrite wholesale and which must be preserved
- Drift is invisible — if NENA revises *Incident*, nobody finds out
- The stated position that "definitions live in the NENA KB" (Gary, session notes L20) is **unauditable**

### 1. Fields required on `GlossaryItem` (`src/types/index.ts`)

```ts
export interface GlossaryItem {
    term: string;
    definition: string;
    source?: 'nena-kb' | 'local';
    sourceRef?: string;       // KB slug, e.g. 'PSAP_(Public_Safety_Answering_Point)'
    sourceRetrieved?: string; // ISO date of last KB check
    nenaTerm?: string;        // canonical KB title, when it differs from term
    localNote?: string;       // text WE appended — held separately from definition
}
```

### 2. Why each field is required

| Field | Needed for |
|---|---|
| `source` | Distinguishes the 10 KB-sourced entries from the 4 local ones. Without it a re-sync cannot tell an authoritative definition from a local one it must not clobber. |
| `sourceRef` | Makes each definition traceable and re-checkable against a specific KB page. |
| `sourceRetrieved` | The KB states *"Approved updates to NENA Knowledge Base Glossary last made: **September 30, 2026**"*. Recording our retrieval date lets a reviewer see both how current our copy is and how current the KB itself was when we read it. |
| `nenaTerm` | **Load-bearing — see §3.** |
| `localNote` | **Load-bearing — see §4.** |

### 3. `nenaTerm` is required, not optional

KB titles are `PSAP (Public Safety Answering Point)`, but `Question.tsx:41` builds the tooltip regex from `term`. **Renaming `term` to the KB's canonical form makes it permanently unmatchable** — the parenthetical expansion never appears in survey text. Therefore:

- `term` must remain the short, matchable string (`PSAP`, `TTY/TDD`, `QA`)
- `nenaTerm` carries the canonical display name (`PSAP (Public Safety Answering Point)`)

📌 `Glossary.tsx:24` currently renders `item.term` as the panel label. To display canonical names **without** breaking tooltips it must render `item.nenaTerm ?? item.term`.

### 4. `localNote` must be a separate field, not a convention

`TTY/TDD` currently reads: NENA's verbatim TTY definition, then *"Related term: TDD (Telecommunications Device for the Deaf)."* **That suffix is ours, not NENA's.** If it lives inside `definition`, the next re-sync overwrites it silently. Holding it in `localNote` makes the re-sync rule mechanical:

> Replace `definition` only. Never touch `term`, `nenaTerm`, or `localNote`. Skip entirely any entry where `source !== 'nena-kb'`.

### 5. Component changes required

| File | Change |
|---|---|
| `src/types/index.ts` | Extend `GlossaryItem` with the optional fields above |
| `src/data/glossary_data.json` | Populate `source`, `sourceRef`, `sourceRetrieved` (`2026-10-15`) on the 10 KB entries; mark the other 4 `local` |
| `src/components/Glossary.tsx` | Render `item.nenaTerm ?? item.term`; optionally show a source marker |
| `src/components/Question.tsx` | Tooltip body may append `localNote`. **Backwards compatible** — it currently reads only `term` and `definition` |
| *(new)* sync/verify script | Re-fetch each `sourceRef`, diff against `definition`, report drift |

### 6. Backwards compatibility — confirmed 2026-10-15

Both consumers read only `term` and `definition` (`Glossary.tsx:24`, `Question.tsx:39–41`), so adding optional fields breaks nothing. Verified against current source.

### 7. Suggested guard test

Extend the existing regression-guard pattern from §1 (`server/answerValidator.test.ts`) with glossary assertions:

- every entry with `source === 'nena-kb'` has both `sourceRef` and `sourceRetrieved`
- every `sourceRef` resolves to a page in `Category:Glossary`
- no duplicate `term` values
- every `term` is regex-metacharacter-clean — guards the escaping fix required by §19
- at least one `localNote` is non-empty, so the field cannot silently rot

### 8. ⚠️ Open questions — working-group input needed

- **Should provenance be visible to respondents?** Displaying "Source: NENA KB" in the Glossary panel signals to PSAPs that definitions are authoritative and centrally maintained — a trust benefit. If it is internal-only, it belongs in the repo and not the UI.
- **Re-sync cadence** — manual, or scheduled? The KB's own currency marker (Sept 30, 2026) suggests quarterly is plausible, but a stale `sourceRetrieved` is worse than none if nobody acts on it.
- **Does NENA require attribution?** Copying ~10 definitions verbatim from the NENA KB into a NENA-owned survey is likely fine, but confirm rather than assume.

---

# 📋 Implementation sequence

Ordered by dependency. Steps 1–3 are prerequisites for everything else.

| Step | Action | Items | Blocking? |
|---|---|---|---|
| **1** | ~~Fix validator/JSON ID drift; add CI guard~~ | #1 | ✅ **DONE 2026-10-14** (Pass 1) |
| **2** | Resolve deadline + reference year + survey name | #10 | 🟠 Yes — affects all 15 count questions |
| **3** | Decide PSAP identifier & amend privacy text; confirm IRB status | #11 | ⚖️ Yes — affects fielding |
| **4** | Set question budget | #24 | ⚖️ Yes — gates additions |
| **5** | Apply agreed data semantics (N/A control, incident/event) | #2, #3, #4 | 🟡 #2 **DONE**, #3 **DONE**, #4 **PARTIAL** — Unknown ships for Q20/Q22/Q40; open question 4 still governs the other 42 numeric questions |
| **6** | Rework transfer questions | #6 | 🟠 |
| **7** | Add work-year denominator; fix "optimum" definition | #8, #9 | 🟠 Highest analytical value |
| **7b** | Settle the processing-time boundary | #7 | 🟠 |
| **8** | Structural edits: Q4, Q3, Q5 | #13, #14, #18 | 🟡 |
| **8b** | ~~Structural edits: Q7/Q9 overlap~~ | #5 | ✅ **DONE 2026-10-15** (Pass 9) — Q7 scoped to Q6; `textarea` input |
| **9** | Coverage additions (within budget) | #15, #16, #17 | 🟡 |
| **10a** | Glossary: escape + plural matching in `Question.tsx` | §19, §21 | 🟠 **NEXT** — restores tooltips on 22 questions |
| **10b** | Glossary: add the ~12 missing terms | §20 | 🟠 |
| **10c** | Glossary: tooltips in `description` / `data_location` | §22 | 🟠 |
| **10d** | Glossary: provenance metadata + sync script | §25 | 🟡 Do before the next content change |
| **11** | Copy fixes — atomic across all three files | #23 | 🔵 |
| **12** | Incentives decision; re-time survey; update Q0 estimate | #12, #24 | ⚖️ |

> ⚠️ **Do not reorder steps 1 and 11's atomic changes.** Any edit to a question ID, a `type`, or an option string requires the matching `answerValidator.ts` change in the same commit.

### Step 10 was reordered 2026-10-15

Pass 3 landed glossary **content** (step 10's second half) before the `Question.tsx` **matching** fixes (step 10's first half). That was the right call — the NENA-sourced definitions are correct regardless of whether tooltips fire — but it leaves the matching bugs untouched. Specifically:

- `Incident` has the right term and the right definition and **still renders zero tooltips** across Q16–Q19 and Q21
- `SLA` and `FTE` likewise

**Step 10a is now the highest-value remaining glossary task.** A single regex change restores tooltips on **22 distinct questions** (measured 2026-10-15 across all 49):

| Term | Restored on |
|---|---|
| `Incident` | Q16, Q17, Q18, Q19, Q21 — **5** |
| `FTE` | Q26, Q27, Q28, Q29, Q30, Q32, Q33, Q34, Q35 — **9** |
| `SLA` | Q42, Q43, Q44 — **3** |
| `PSAP` | Q0, Q0.2, Q6, Q7, Q8 — **5** |

See §19 Constraint C — ⚠️ the change needs the capture-group fix as well, or it silently no-ops while tests still pass.

---

# ❓ Open questions requiring working-group input

1. **What exactly is the processing-time boundary?** Answer→dispatch, answer→dispatchable, or talk time + wrap-up? (§7)
2. **Which work-year denominator is canonical** — 2,080 or 2,184? (§8)
3. **Does FTE include part-time, job-share, and casual staff?** (§8) — also blocks the FTE glossary definition (§21)
4. **What should each blank answer mean** in the dataset — not applicable, unavailable, or unknown? (§4)
5. **Will the survey go through IRB review?** Unanswered in both source documents. (§11)
6. **Can a PSAP identifier be collected** without invalidating the Q0.2 anonymity promise? (§11)
7. **Is the 07/31/2026 deadline an error, or has the launch already lapsed?** (§10)
8. **What is the correct reference year** — 2025 or 2026 partial? (§10)
9. **Is the survey length budget fixed, and at what number?** (§24)
10. ~~Is "Incident" confirmed as the NENA-preferred term for all of Q16–Q21?~~ — ✅ **CLOSED 2026-10-15.** Confirmed against the NENA KB. See §2 and §25.
11. **NEW — Should respondents count incidents or CAD records in Q16–Q21?** NENA's definition allows multiple calls per incident. Without `responseEmphasis` guidance, incident totals may not reconcile with call totals. (§2)
12. **NEW — Should `CFAI` and `IAED` be removed from the glossary?** Neither appears in the NENA KB, neither matches any question, and neither is 9-1-1 terminology. (§21, §25)
13. **NEW — Should glossary provenance be visible to respondents, and on what re-sync cadence?** (§25)
14. **NEW — Who owns a locally-authored `10-Digit Emergency` definition?** No NENA KB entry exists; it needs a working-group author. (§19 Constraint B, §21)
15. **NEW — Should `QA` / `QI` / `APCO` / `NG9-1-1` be retained despite matching no question?** Now NENA-sourced, which makes retention more defensible than when §21 originally suggested removing them. (§19 Constraint A)
16. **NEW — Should `Q23`'s 100,000/hour cap be tightened?** That is 28 keyups/second sustained — implausible — and its implied annual ceiling (876M) is 8.8× Q22's. Not changed in Pass 7. (§3)
17. **NEW — Does "leave blank = not recorded" become the survey-wide convention, or just a Q22 local convention?** Pass 7 introduced it for Q22 alone. §4 is the real fix but remains blocked on question 4. (§3, §4)
18. ~~Did Brian observe Q7 duplicating Q9 or Q6?~~ — ✅ **CLOSED 2026-10-15.** The recommendation's own table contradicted Q9; the real overlap was Q6↔Q7, now closed. (§5)
19. ~~What is the evidence that respondents answer Q7 with agency names?~~ — ✅ **CLOSED as not confirmed.** No data was ever cited. Recorded at §5 as a standing observation rather than an open question.
20. **Should "Unknown" split into "Unknown" and "Not applicable"?** The Pass 10 checkbox conflates "I don't know this figure" with "this figure doesn't exist at our centre". Splitting is now a mechanical addition — the mechanism and storage shape both exist. (§4)
21. **NEW — Should the Unknown affordance extend to the other 42 numeric questions?** Pass 10 scoped it to Q20/Q22/Q40 per decision. The `number-or-unknown` kind is now generic, so extending it is a per-question one-line change plus the JSON. (§4)
22. **NEW — Was the `''` → `0` coercion bug affecting real submissions?** Fixed in Pass 10, but any response recorded before that fix may hold a spurious zero where a respondent cleared a numeric field. Worth a backfill audit. (§4)

---

# 🔵 26. TypeScript build gates — both were broken

*Added 2026-10-15. Fixed in Pass 6, commit `a65d045`.*

📌 **Not a survey-content issue.** Found while verifying Pass 4. Both gates were failing, so `npm run start:prod` could not deploy.

## Impact

| Gate | Command | Before | After |
|---|---|---|---|
| Front-end | `npm run build` = `tsc && vite build` | **37 errors** | ✅ **0** |
| Server | `npm run build:server` = `tsc -p server/tsconfig.json` | **27 errors** | ✅ **0** |

`npm run start:prod` is `build:server && server:prod`, so **production deploy was blocked entirely**. Artifacts had to be produced by invoking `vite build` directly, bypassing the gate.

**Confirmed pre-existing:** both counts reproduce at `c07e487` with all Pass 2–5 changes stashed. Nothing in this work caused them.

## Front-end root cause — 35 of 37

`vite.config.ts:20` sets `test.globals = true`, so `vi` / `describe` / `it` / `expect` / `beforeEach` **exist at runtime**. But `tsconfig.json` had `"include": ["src"]` and declared no `types`, so TypeScript never loaded `vitest/globals` and could not see them.

Fix: add `"types": ["vitest/globals", "node"]`. One line, matches config that was already there.

> 📌 This was latent because the repo has **two styles** of test. Five files (`surveyService`, `analytics`, `answerValidator`, `database.retention`, `server`) import explicitly `from 'vitest'`. Three (`App`, `Question`, `SurveyLanding`) relied on ambient globals. Only the latter three failed. An alternative fix — adding explicit imports to those three — would also work but leaves `globals: true` doing real work while looking unused.

**Remaining 2** were `noUnusedLocals` on `import React from 'react'` in `Question.test.tsx` and `SurveyLanding.test.tsx` — unnecessary under `jsx: "react-jsx"`. `App.test.tsx` legitimately keeps its import (uses `React.ReactNode` as a type).

## Server root causes — all 27

| Count | Cause | Fix |
|---|---|---|
| 4 | `.ts` extension in import specifiers | Dropped the extension. **Enabling `allowImportingTsExtensions` was not viable** — `server/tsconfig.json` emits JS, and that flag requires `noEmit` or `emitDeclarationOnly` |
| 22 | `createDeps()` mock had drifted from the `ServerDeps` interface | Exported `ServerDeps`; annotated `createDeps()` with a mapped `MockedFunction` type |
| 1 | `answerValidator.test.ts` inline survey type omitted `options` | Added `options?: string[]` |
| 2 | `duckdb.ts` passed `unknown[]` to the DuckDB driver | Typed params as `DuckDBValue[]` |

**The mock-drift fix has a subtlety worth recording.** Annotating `createDeps(): ServerDeps` alone *worsened* things — it erased the `Mock` type, so `.mockResolvedValueOnce`, `.mockReturnValueOnce` and `.not.toHaveBeenCalled()` stopped compiling (22 errors → 8). The fix is to map over the interface so each member stays a `Mock`:

```ts
type MockedServerDeps = { [K in keyof ServerDeps]: MockedFunction<ServerDeps[K]> };
```

This satisfies `createApp(deps)` **and** keeps assertion methods. A second one-line fix was needed: `validateAnswer`'s mock returned `{ valid: true }` whose inferred type is `boolean`, but `AnswerValidationResult` is a discriminated union keyed on the literal `true`. Required `valid: true as const`.

📌 **These mock errors were real drift, not noise.** The mocks had fallen behind the `ServerDeps` interface — meaning the route tests were asserting against a dependency shape the server no longer actually uses. Worth re-running the suite after any interface change.

## Follow-up — not fixed here

- **`server/dist/` is tracked** (`.gitignore:10` only excludes root `/dist`) and `server/tsconfig.json` has `include: ["**/*.ts"]`, so **four compiled test files are committed as build output**. Should be excluded.
- `tsconfig.node.json` is declared in `references` but plain `tsc` never builds it — only `tsc --build` would.

## Verification

- `npm run build` → 0 errors, bundle emitted
- `npm run build:server` → 0 errors, exit 0
- `npm test -- --run` → **95/95 passing**, 8 files

---

# 📌 Commit state

**Working tree clean.** All six passes committed to `main` on 2026-10-15 and pushed to `origin/main`.

| Commit | Pass | Contents |
|---|---|---|
| `c07e487` | 1 | Validator alignment (pre-existing) |
| `07a7f00` | 2 | events → incidents, Q16–Q21 |
| `dd17a6e` | 3 | NENA KB glossary alignment, 10 entries |
| `1874630` | 4 | Snapshot removal (877 lines) |
| `5fcda39` | 5 | Static rebuild — new bundle, `index.html` repointed |
| `a65d045` | 6 | Build gates — both TypeScript gates to 0 errors |

> Each is a single logical change and independently revertable. Pass 5 is deliberately separate so the 224 kB bundle swap does not obscure the source change in review.