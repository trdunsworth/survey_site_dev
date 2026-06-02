/**
 * answerValidator.ts — schema-aware server-side validation for all survey answers.
 *
 * Each question in survey_data.json is represented here with enough schema
 * information to validate the answer that arrives at POST /api/answers before
 * anything touches the database.
 *
 * Design goals:
 *  - Reject answers for questions that have no input (type "info").
 *  - Constrain enum-typed questions (select / radio / checkbox) to the
 *    declared option set so no arbitrary strings end up in the DB.
 *  - Strip HTML from all text fields to prevent stored XSS.
 *  - Enforce sensible numeric ranges per question to guard against bad data.
 *  - Return a sanitized copy of the value so the caller always writes the
 *    clean version rather than the raw payload.
 *
 * When to update this file:
 *  - A new question is added to survey_data.json → add it to QUESTION_SCHEMA.
 *  - An option list changes → update the corresponding entry here.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** All valid question types in the survey. */
type QuestionKind =
    | 'info'
    | 'select'
    | 'radio'
    | 'checkbox'
    | 'text'
    | 'number'
    | 'agencies-with-count';

interface BaseSchema {
    kind: QuestionKind;
}

interface InfoSchema extends BaseSchema {
    kind: 'info';
}

interface SelectSchema extends BaseSchema {
    kind: 'select';
    options: ReadonlySet<string>;
}

interface RadioSchema extends BaseSchema {
    kind: 'radio';
    options: ReadonlySet<string>;
    /** When true, the option flagged as "other" must carry a positive numeric otherText. */
    otherIsNumeric?: boolean;
}

interface CheckboxSchema extends BaseSchema {
    kind: 'checkbox';
    options: ReadonlySet<string>;
}

interface TextSchema extends BaseSchema {
    kind: 'text';
    maxLength: number;
}

interface NumberSchema extends BaseSchema {
    kind: 'number';
    min: number;
    max: number;
    integerOnly: boolean;
}

interface AgenciesWithCountSchema extends BaseSchema {
    kind: 'agencies-with-count';
    agencies: ReadonlySet<string>;
}

type SchemaEntry =
    | InfoSchema
    | SelectSchema
    | RadioSchema
    | CheckboxSchema
    | TextSchema
    | NumberSchema
    | AgenciesWithCountSchema;

// ── Result type ───────────────────────────────────────────────────────────────

export type AnswerValidationResult =
    | { valid: true;  sanitized: unknown }
    | { valid: false; reason: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 2000;

/** Identify the "other" option label used across the survey. */
const OTHER_LABEL = 'Other (Please Specify)';

function isOtherLabel(s: string): boolean {
    return /\bother\b/i.test(s);
}

/**
 * Strip HTML tags and trim whitespace so text answers can never carry
 * injected markup.  A library like DOMPurify is not available server-side,
 * but stripping tags is sufficient for a stored-XSS defence here because the
 * data is rendered via React (inherently escaped) and only exported as JSON /
 * CSV where raw HTML is meaningless.
 */
function sanitizeText(raw: string, maxLength: number): string {
    return raw
        .replace(/<[^>]*>/g, '')   // strip any HTML/XML tags
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip non-printable control chars
        .trim()
        .slice(0, maxLength);
}

function s(options: string[]): ReadonlySet<string> {
    return new Set(options);
}

// ── Question schema ───────────────────────────────────────────────────────────
//
// Keys match the `id` field in survey_data.json (always stored as strings after
// JSON serialisation — "8.1" rather than 8.1).

const QUESTION_SCHEMA: Readonly<Record<string, SchemaEntry>> = {

    // ── id 0 / 39 — info blocks, no user input ────────────────────────────────
    '0':  { kind: 'info' },
    '39': { kind: 'info' },

    // ── id 1 — state / province select ───────────────────────────────────────
    '1': {
        kind: 'select',
        options: s([
            'Alabama', 'Alaska', 'American Samoa', 'Arizona', 'Arkansas',
            'British Columbia', 'California', 'Colorado', 'Connecticut',
            'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Guam',
            'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas',
            'Kentucky', 'Louisiana', 'Maine', 'Manitoba', 'Maryland',
            'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
            'Montana', 'Nebraska', 'Nevada', 'New Brunswick',
            'Newfoundland and Labrador', 'New Hampshire', 'New Jersey',
            'New Mexico', 'New York', 'North Carolina', 'North Dakota',
            'Northern Mariana Islands', 'Northwest Territories', 'Nova Scotia',
            'Nunavut', 'Ohio', 'Oklahoma', 'Ontario', 'Oregon', 'Pennsylvania',
            'Prince Edward Island', 'Puerto Rico', 'Quebec', 'Rhode Island',
            'Saskatchewan', 'South Carolina', 'South Dakota', 'Tennessee',
            'Texas', 'U.S. Virgin Islands', 'Utah', 'Vermont', 'Virginia',
            'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
            OTHER_LABEL,
        ]),
    },

    // ── id 2, 3 — base / peak population ────────────────────────────────────
    '2': {
        kind: 'select',
        options: s([
            'Less than 10,000', '10,000 - 25,000', '25,000 - 50,000',
            '50,000 - 100,000', '100,000 - 250,000', '250,000 - 500,000',
            '500,000 - 1,000,000', 'Over 1,000,000',
        ]),
    },
    '3': {
        kind: 'select',
        options: s([
            'Less than 10,000', '10,000 - 25,000', '25,000 - 50,000',
            '50,000 - 100,000', '100,000 - 250,000', '250,000 - 500,000',
            '500,000 - 1,000,000', 'Over 1,000,000',
        ]),
    },

    // ── id 4 — population variation factors (checkbox) ───────────────────────
    '4': {
        kind: 'checkbox',
        options: s([
            'Daytime Increase (Worker Influx)',
            'Seasonal Peaks',
            'Event Peaks',
            'None',
            OTHER_LABEL,
        ]),
    },

    // ── id 5 — PSAP classification (radio) ───────────────────────────────────
    '5': {
        kind: 'radio',
        options: s(['Primary', 'Secondary', 'Other']),
    },

    // ── id 6 — services provided (checkbox) ──────────────────────────────────
    '6': {
        kind: 'checkbox',
        options: s(['Call Taking', 'Dispatching', 'Walk Up', 'SMS/Text']),
    },

    // ── id 7 — additional services (free text) ───────────────────────────────
    '7': { kind: 'text', maxLength: MAX_TEXT_LENGTH },

    // ── id 8 — operational governance (radio) ───────────────────────────────
    '8': {
        kind: 'radio',
        options: s([
            'Federal Government (Airport, Tribal, LEO, Miliary, Other)',
            'State Government  (LEO, Other)',
            'County Government (Sheriff, Fire, EMS, Other)',
            'Municipal Government (Fire, EMS, LEO, Other)',
            'Independent Tax Funded Authority',
            'Private',
            OTHER_LABEL,
        ]),
    },

    // ── id 8.1 — agencies under governance (checkbox, conditional) ───────────
    '8.1': {
        kind: 'checkbox',
        options: s([
            'Police', 'Sheriff', 'Fire', 'EMS', 'Airport', 'Tribal', 'Military',
            OTHER_LABEL,
        ]),
    },

    // ── id 9 — agencies answered / dispatched (agencies-with-count) ──────────
    '9': {
        kind: 'agencies-with-count',
        agencies: s(['Police', 'Fire', 'EMS', 'Sheriff', 'Animal Control', OTHER_LABEL]),
    },

    // ── id 10 — call types (checkbox) ────────────────────────────────────────
    '10': {
        kind: 'checkbox',
        options: s([
            '9-1-1', 'Admin', '10-digit Emergency', 'SMS/Text', 'TTY/TDD',
            OTHER_LABEL,
        ]),
    },

    // ── ids 11–19 — yearly call / event counts ───────────────────────────────
    // Cap at 100 million: no PSAP realistically handles more than that.
    '11': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },
    '12': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },
    '13': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },
    '14': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },
    '15': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },
    '16': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },
    '17': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },
    '18': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },
    '19': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },

    // ── id 20 — estimated radio keyups (free text — see survey data) ──────────
    '20': { kind: 'text', maxLength: MAX_TEXT_LENGTH },

    // ── id 21 — average radio keyups per hour ────────────────────────────────
    '21': { kind: 'number', min: 0, max: 100_000, integerOnly: false },

    // ── id 22, 23 — transferred calls ────────────────────────────────────────
    '22': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },
    '23': { kind: 'number', min: 0, max: 100_000_000, integerOnly: true },

    // ── ids 24–28 — FTE counts ────────────────────────────────────────────────
    '24': { kind: 'number', min: 0, max: 10_000, integerOnly: true },
    '25': { kind: 'number', min: 0, max: 10_000, integerOnly: true },
    '26': { kind: 'number', min: 0, max: 10_000, integerOnly: true },
    '27': { kind: 'number', min: 0, max: 10_000, integerOnly: true },
    '28': { kind: 'number', min: 0, max: 10_000, integerOnly: true },

    // ── id 29 — shift length (radio, Other → positive numeric hours) ──────────
    '29': {
        kind: 'radio',
        options: s(['8', '10', '12', OTHER_LABEL]),
        otherIsNumeric: true,
    },

    // ── ids 30–33 — min/max FTEs per shift ───────────────────────────────────
    '30': { kind: 'number', min: 0, max: 10_000, integerOnly: true },
    '31': { kind: 'number', min: 0, max: 10_000, integerOnly: true },
    '32': { kind: 'number', min: 0, max: 10_000, integerOnly: true },
    '33': { kind: 'number', min: 0, max: 10_000, integerOnly: true },

    // ── ids 34–37 — average answer / processing times (seconds) ──────────────
    // No PSAP's average answer time is realistically above 3600 s (1 hour).
    '34': { kind: 'number', min: 0, max: 3_600, integerOnly: false },
    '35': { kind: 'number', min: 0, max: 3_600, integerOnly: false },
    '36': { kind: 'number', min: 0, max: 3_600, integerOnly: false },
    '37': { kind: 'number', min: 0, max: 3_600, integerOnly: false },

    // ── id 38 — average calls per telecommunicator FTE per hour ──────────────
    '38': { kind: 'number', min: 0, max: 1_000, integerOnly: false },
};

// ── Per-kind validators ───────────────────────────────────────────────────────

function validateOtherVariant(
    raw: unknown,
    options: ReadonlySet<string>,
    otherIsNumeric: boolean,
): AnswerValidationResult {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return { valid: false, reason: 'Answer must be a string or { option, otherText } object' };
    }

    const obj = raw as Record<string, unknown>;
    const option = obj['option'];
    const otherText = obj['otherText'];

    if (typeof option !== 'string' || !options.has(option)) {
        return { valid: false, reason: `"${String(option)}" is not a valid option` };
    }

    if (!isOtherLabel(option)) {
        // Non-other object form — acceptable, strip extra keys
        return { valid: true, sanitized: { option } };
    }

    // "Other" branch — otherText is required
    if (otherText === undefined || otherText === null || otherText === '') {
        return { valid: true, sanitized: { option } }; // allow empty other without text
    }

    if (otherIsNumeric) {
        const num = Number(otherText);
        if (!Number.isFinite(num) || num <= 0) {
            return {
                valid: false,
                reason: '"Other (Please Specify)" requires a positive numeric value',
            };
        }
        return { valid: true, sanitized: { option, otherText: String(num) } };
    }

    if (typeof otherText !== 'string') {
        return { valid: false, reason: 'otherText must be a string' };
    }
    return {
        valid: true,
        sanitized: { option, otherText: sanitizeText(otherText, MAX_TEXT_LENGTH) },
    };
}

function validateSelect(
    raw: unknown,
    schema: SelectSchema,
): AnswerValidationResult {
    if (typeof raw !== 'string') {
        return { valid: false, reason: 'Answer must be a string' };
    }
    if (!schema.options.has(raw)) {
        return { valid: false, reason: `"${raw}" is not a valid option` };
    }
    return { valid: true, sanitized: raw };
}

function validateRadio(
    raw: unknown,
    schema: RadioSchema,
): AnswerValidationResult {
    // Plain string
    if (typeof raw === 'string') {
        if (!schema.options.has(raw)) {
            return { valid: false, reason: `"${raw}" is not a valid option` };
        }
        return { valid: true, sanitized: raw };
    }
    // Object form { option, otherText }
    return validateOtherVariant(raw, schema.options, schema.otherIsNumeric ?? false);
}

function validateCheckbox(
    raw: unknown,
    schema: CheckboxSchema,
): AnswerValidationResult {
    if (!Array.isArray(raw)) {
        return { valid: false, reason: 'Answer must be an array' };
    }
    if (raw.length === 0) {
        return { valid: true, sanitized: [] };
    }

    const sanitized: unknown[] = [];
    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (typeof item === 'string') {
            if (!schema.options.has(item)) {
                return { valid: false, reason: `"${item}" is not a valid option` };
            }
            sanitized.push(item);
        } else if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            const result = validateOtherVariant(item, schema.options, false);
            if (!result.valid) return result;
            sanitized.push(result.sanitized);
        } else {
            return { valid: false, reason: `Item at index ${i} is not a valid answer` };
        }
    }
    return { valid: true, sanitized };
}

function validateText(
    raw: unknown,
    schema: TextSchema,
): AnswerValidationResult {
    if (typeof raw !== 'string') {
        return { valid: false, reason: 'Answer must be a string' };
    }
    return { valid: true, sanitized: sanitizeText(raw, schema.maxLength) };
}

function validateNumber(
    raw: unknown,
    schema: NumberSchema,
): AnswerValidationResult {
    const num = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof num !== 'number' || !Number.isFinite(num)) {
        return { valid: false, reason: 'Answer must be a finite number' };
    }
    if (num < schema.min) {
        return { valid: false, reason: `Value must be at least ${schema.min}` };
    }
    if (num > schema.max) {
        return {
            valid: false,
            reason: `Value must be no greater than ${schema.max}`,
        };
    }
    if (schema.integerOnly && !Number.isInteger(num)) {
        return { valid: false, reason: 'Value must be a whole number' };
    }
    return { valid: true, sanitized: num };
}

function validateAgenciesWithCount(
    raw: unknown,
    schema: AgenciesWithCountSchema,
): AnswerValidationResult {
    if (!Array.isArray(raw)) {
        return { valid: false, reason: 'Answer must be an array' };
    }

    const sanitized: unknown[] = [];

    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return { valid: false, reason: `Item at index ${i} must be an object` };
        }

        const obj = item as Record<string, unknown>;
        const agency = obj['agency'];
        const count  = obj['count'];

        if (typeof agency !== 'string' || !schema.agencies.has(agency)) {
            return {
                valid: false,
                reason: `"${String(agency)}" is not a recognised agency`,
            };
        }

        const numCount = typeof count === 'string' ? Number(count) : count;
        if (typeof numCount !== 'number' || !Number.isFinite(numCount) || numCount < 0) {
            return {
                valid: false,
                reason: `Count for "${agency}" must be a non-negative number`,
            };
        }
        if (!Number.isInteger(numCount)) {
            return {
                valid: false,
                reason: `Count for "${agency}" must be a whole number`,
            };
        }
        if (numCount > 10_000) {
            return {
                valid: false,
                reason: `Count for "${agency}" exceeds the maximum allowed value`,
            };
        }

        const entry: Record<string, unknown> = {
            agency,
            count: numCount,
        };

        // If "Other", allow and sanitize the otherType free-text field
        if (isOtherLabel(agency) && typeof obj['otherType'] === 'string') {
            entry['otherType'] = sanitizeText(obj['otherType'] as string, 200);
        }

        sanitized.push(entry);
    }

    return { valid: true, sanitized };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate and sanitize a single answer for the given question ID.
 *
 * @param questionId - The question's `id` from survey_data.json. Both number
 *                     and string forms are accepted ("8.1" and 8.1 both work).
 * @param rawAnswer  - The raw parsed JSON value from the request body.
 *
 * Returns `{ valid: true, sanitized }` on success — always write `sanitized`
 * to the database, never the raw value.
 * Returns `{ valid: false, reason }` on failure — respond 400 to the client.
 */
export function validateAnswer(
    questionId: string | number,
    rawAnswer: unknown,
): AnswerValidationResult {
    const key = String(questionId);

    // If we have no schema for this question ID, reject it.  This prevents
    // answers from being stored for invented / non-existent question IDs.
    const schema = QUESTION_SCHEMA[key];
    if (!schema) {
        return { valid: false, reason: `Unknown question ID: ${key}` };
    }

    // A null/undefined answer means "clear this answer" — always permitted.
    if (rawAnswer === null || rawAnswer === undefined) {
        return { valid: true, sanitized: null };
    }

    switch (schema.kind) {
        case 'info':
            return { valid: false, reason: 'Answers cannot be submitted for informational sections' };
        case 'select':
            return validateSelect(rawAnswer, schema);
        case 'radio':
            return validateRadio(rawAnswer, schema);
        case 'checkbox':
            return validateCheckbox(rawAnswer, schema);
        case 'text':
            return validateText(rawAnswer, schema);
        case 'number':
            return validateNumber(rawAnswer, schema);
        case 'agencies-with-count':
            return validateAgenciesWithCount(rawAnswer, schema);
    }
}
