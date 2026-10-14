# PSAP Survey — Content & Data Review Recommendations

**Prepared:** 2026-10-14
**Scope:** `src/data/survey_data.json`, `src/data/glossary_data.json`
**Inputs reviewed:**
- `src/data/Consider if certain information is obtai.md`
- `src/data/JCM_Chat_Wednesday_20260916.docx` (JCM working-group chat, 2026-09-16)
- `src/data/JCM Data Collection Session Notes.docx` (data collection working-group session)

**Status:** Item #1 (validator drift) is **RESOLVED** — see the resolution note at the end of that section. All other items are recommendations only; no content changes have been made to `survey_data.json` or `glossary_data.json`.

---

## How to read this document

| Marker | Meaning |
|---|---|
| 🔴 **BLOCKER** | Data loss / unanswerable questions. Fix before fielding. |
| 🟠 **HIGH** | Changes the meaning or usability of collected data. |
| 🟡 **MEDIUM** | Ambiguity explicitly raised in a working-group session. |
| 🔵 **POLISH** | Copy edits, consistency, low risk. |
| ⚖️ **DECISION** | Requires a human decision, not a code change. |
| 📌 | Tied to a specific working-group participant or the `.md` review note |

Every recommendation cites its source so the working group can verify intent before you commit to it.

---

## Summary

| # | Area | Recommendation | Priority | Source |
|---|---|---|---|---|
| 1 | Validator drift | ~~10 questions rejected server-side~~ **RESOLVED** — see §1 | ✅ DONE | Code audit |
| 2 | Data hygiene | "events" → "incidents" (Q16–Q21) | 🟠 HIGH | Gary (NENA CRC) |
| 3 | Data hygiene | Q22 `text` → `number`; remove "Estimated" | 🟠 HIGH | Review note L2 |
| 4 | Data hygiene | Add "Not available / Don't know" escape hatch | 🟠 HIGH | Review note L1, Daniel Hagan |
| 5 | Structure | Q7 duplicates Q9 | 🟠 HIGH | Brian Bond |
| 6 | Structure | Transfers: warm/cold, internal/external, reason, NA | 🟠 HIGH | Sandy Dyre, Sam Bard, Burt Ray, Daniel |
| 7 | Definitions | Q36–Q39 processing-time boundary | 🟠 HIGH | Heather, Crystal, Justin |
| 8 | Definitions | Shift/staffing work-year denominator (2,080 vs 2,184) | 🟠 HIGH | Gary, Rebecca Conners |
| 9 | Definitions | "Optimum" / "fully staffed" undefined | 🟠 HIGH | Barry Hutchins |
| 10 | Coverage | Outgoing calls unmeasured | 🟡 MEDIUM | Crystal, Ernie Qualls |
| 11 | Coverage | Non-emergency vs. administrative conflated | 🟡 MEDIUM | Crystal |
| 12 | Coverage | Q4 add colleges/universities | 🟡 MEDIUM | Session notes L17, Joel McDonald |
| 13 | Coverage | Q3 peak population escape hatch | 🟡 MEDIUM | Brian Bond (AZ) |
| 14 | Coverage | Q6 "Call Taking" too generic | 🟡 MEDIUM | Sam Bard |
| 15 | Dates | Reference year unspecified; **deadline already passed** | 🟠 HIGH | Review note L3 |
| 16 | Fieldwork | Duplicate-response guardrails + PSAP identifier | ⚖️ DECISION | Review note L5, Brian Bond, Tony |
| 17 | Fieldwork | Incentives / return of answers | ⚖️ DECISION | Review note L6, Session notes L34 |
| 18 | Glossary | Dead, broken, and unmatched terms | 🟠 HIGH | Code audit |
| 19 | Glossary | ~13 missing terms | 🟠 HIGH | Cross-referenced |
| 20 | Glossary | Tooltips don't render in `description` / `data_location` | 🟠 HIGH | `Question.tsx` audit |
| 21 | Glossary | Plurals never match tooltips | 🟠 HIGH | `Question.tsx` audit |
| 22 | Glossary | Definition rewrites (FTE, CAD, PSAP, 10-Digit) | 🟡 MEDIUM | Working group |
| 23 | Polish | Typos, double-space, centre/center | 🔵 POLISH | Code audit |
| 24 | Polish | Survey length budget | ⚖️ DECISION | Chet Ripka, Rick Erickson |

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

> **Recommendation:** if the intent is **agent occupancy** — which is what a staffing model needs — use Crystal's formulation. But note it requires wrap-up time to be measurable, which is not universal (see #19, Justin's question).

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

## Constraint A — four terms never match anything

| Term | Status |
|---|---|
| `CFAI` | Never appears in the survey |
| `APCO` | Never appears in the survey |
| `IAED` | Never appears in the survey |
| `NG9-1-1` | Never appears in the survey |
| `QA/QI` | Never appears in the survey |

They are still shown in the Glossary panel, so they are not *wrong* — but they provide no in-context help.

## Constraint B — one term is structurally broken

```json
{ "term": "Ten-Digit Emergency", "definition": "Emergency calls received on a standard 10-digit phone line rather than the 9-1-1 network." }
```

The survey uses **`10-digit emergency`** (Q10 option, Q12 question). The glossary term spells it **`Ten-Digit Emergency`** — spelled-out number *and* differing hyphenation. **It can never match.**

📌 This matters: Canadian and some US centers are significant users of 10-digit emergency lines, and this is one of the more consequential definitions in the survey.

## Constraint C — plurals and possessives never match

The `\b` word boundary requires a non-word character after the term. `PSAPs` and `PSAP's` therefore get **no tooltip**.

| Term | Plural form | Questions affected |
|---|---|---|
| `PSAP` | `PSAPs` / `PSAP's` | 6 |
| `FTE` | `FTEs` / `FTE's` | 9 |
| `SLA` | `SLAs` | 3 |

📌 **`SLA` is the clearest casualty:** Q42–Q44 say *"partner agency **SLAs**"* — plural, so the tooltip never fires on the only questions that use the term.

### 🛠 Recommended fix

Allow an optional suffix:

```ts
const regex = new RegExp(`\\b(${term})(?:['’]s|s)?\\b`, 'gi');
```

---

# 🔵 20. Glossary — missing terms

Terms used in the survey with **no glossary entry**, verified by cross-reference:

| Term | Used in | Why it matters | Source |
|---|---|---|---|
| **Incident** | Q16–Q21 | Gary's mandated term; currently undefined | Session notes L24 |
| **NCIC** | Q20, Q10 area | Q20 asks for transaction counts with no definition | Q20 |
| **Call processing time** | Q36–Q39 | The survey's core metric; boundary disputed (#7) | Heather, Crystal |
| **Wrap-up time** | processing metrics | Affects agent-occupancy models | Justin Prahar |
| **Radio keyup** | Q22, Q23 | Referenced without definition | Q22–Q23 |
| **Warm transfer / Cold transfer** | Q24, Q25, Q41 | Sandy raised the distinction; drives workload model | Sandy Dyre |
| **Work year (2,080 / 2,184)** | Q26–Q35 | Prerequisite for FTE normalization | Gary, Rebecca |
| **Contracted vs. Net Available Hours** | Q26–Q35 | Crystal's availability model | Crystal Lawrence |
| **Concurrent calls / Busy hour** | Q24-ish | The metric that actually drives NGCS cost | Daniel Hagan, Justin |
| **NGCS / ACD** | Q36, Q40 | Pierre's measurement caveats | Pierre Foucault, Sam Bard |
| **Backup center / Mutual Aid** | Q9, Q25 | Roxy dispatches for 5 down counties — not captured | Roxy VanGundy |
| **988 / RTT / Satellite SOS** | Q10 | Requested additions to call types | Sandy, Martin Michaud, Diane Dupar |
| **RFA / Call provider type** | Q36, Q40 | Needed for comparable time-series analysis | Daniel Hagan |

---

# 🔵 21. Glossary — definition rewrites

| Term | Current definition | Issue | Suggested |
|---|---|---|---|
| **FTE** | *"A unit that indicates the workload of an employed person"* | Too thin; omits the work-year basis and part-time/job-share treatment | Include the 2,080 / 2,184 denominator (see #8) and state whether part-time and job-share are included |
| **CAD** | *"Computer Aided Dispatch. Systems used by dispatchers to track status and location of resources."* | Defines dispatch systems generally, not the **data source** that `data_location` fields depend on | State which data comes from CAD vs. phone software — Joel: *"the source of truth is two different data tables, the call answer solutions, and the CAD solution"* |
| **PSAP** | *"A facility equipped and staffed to receive 9-1-1 calls."* | No Primary/Secondary distinction | Add, **by reference to the EPRC** (see #18) |
| **10-Digit Emergency** | Currently named `"Ten-Digit Emergency"` | Never matches (see #19) | Rename to `"10-Digit Emergency"`; clarify the boundary vs. non-emergency/admin |
| **APCO** | *"Association of Public-Safety Communications Officials"* | ⚠️ Verify the official expansion — the hyphenation looks incorrect | Confirm against APCO's official name |

📌 **Also consider removing** `CFAI`, `IAED`, `APCO`, `NG9-1-1`, and `QA/QI` from the visible glossary — they match no question. If they're wanted for future phases, move them to a separate "reserved terms" list so the panel reflects what actually helps respondents.

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

# 📋 Implementation sequence

Ordered by dependency. Steps 1–3 are prerequisites for everything else.

| Step | Action | Items | Blocking? |
|---|---|---|---|
| **1** | ~~Fix validator/JSON ID drift; add CI guard~~ | #1 | ✅ **DONE 2026-10-14** |
| **2** | Resolve deadline + reference year + survey name | #10 | 🟠 Yes — affects all 15 count questions |
| **3** | Decide PSAP identifier & amend privacy text; confirm IRB status | #11 | ⚖️ Yes — affects fielding |
| **4** | Set question budget | #24 | ⚖️ Yes — gates additions |
| **5** | Apply agreed data semantics (N/A control, incident/event) | #2, #3, #4 | 🟠 |
| **6** | Rework transfer questions | #6 | 🟠 |
| **7** | Add work-year denominator; fix "optimum" definition | #8, #9 | 🟠 Highest analytical value |
| **7b** | Settle the processing-time boundary | #7 | 🟠 |
| **8** | Structural edits: Q7/Q9 overlap, Q4, Q3, Q5 | #5, #13, #14, #18 | 🟡 |
| **9** | Coverage additions (within budget) | #15, #16, #17 | 🟡 |
| **10** | Glossary: `Question.tsx` fixes, then content | #19, #20, #21, #22 | 🟠 |
| **11** | Copy fixes — atomic across all three files | #23 | 🔵 |
| **12** | Incentives decision; re-time survey; update Q0 estimate | #12, #24 | ⚖️ |

> ⚠️ **Do not reorder steps 1 and 11's atomic changes.** Any edit to a question ID, a `type`, or an option string requires the matching `answerValidator.ts` change in the same commit.

---

# ❓ Open questions requiring working-group input

1. **What exactly is the processing-time boundary?** Answer→dispatch, answer→dispatchable, or talk time + wrap-up? (#7)
2. **Which work-year denominator is canonical** — 2,080 or 2,184? (#8)
3. **Does FTE include part-time, job-share, and casual staff?** (#8)
4. **What should each blank answer mean** in the dataset — not applicable, unavailable, or unknown? (#4)
5. **Will the survey go through IRB review?** Unanswered in both source documents. (#11)
6. **Can a PSAP identifier be collected** without invalidating the Q0.2 anonymity promise? (#11)
7. **Is the 07/31/2026 deadline an error, or has the launch already lapsed?** (#10)
8. **What is the correct reference year** — 2025 or 2026 partial? (#10)
9. **Is the survey length budget fixed, and at what number?** (#24)
10. **Is "Incident" confirmed as the NENA-preferred term** for all of Q16–Q21? (#2)