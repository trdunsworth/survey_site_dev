// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UNKNOWN_VALUE, getSchemaQuestionIds, validateAnswer } from './answerValidator';
describe('validateAnswer', () => {
    it('rejects unknown question IDs', () => {
        const result = validateAnswer('9999', 'value');
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.reason).toContain('Unknown question ID');
        }
    });
    it('sanitizes text answers by stripping tags', () => {
        const result = validateAnswer('7', '<b>hello</b>');
        expect(result).toEqual({ valid: true, sanitized: 'hello' });
    });
    it('rejects invalid select options', () => {
        const result = validateAnswer('1', 'NotARealState');
        expect(result.valid).toBe(false);
    });
    it('accepts numeric strings for integer questions and normalizes to number', () => {
        const result = validateAnswer('11', '42');
        expect(result).toEqual({ valid: true, sanitized: 42 });
    });
    it('rejects non-integer numbers for integer-only questions', () => {
        const result = validateAnswer('11', 1.5);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.reason).toContain('whole number');
        }
    });
    it('requires positive numeric otherText for question 27 (shift length)', () => {
        const validResult = validateAnswer('27', { option: 'Other (Please Specify)', otherText: '2' });
        const invalidResult = validateAnswer('27', { option: 'Other (Please Specify)', otherText: '-1' });
        expect(validResult).toEqual({
            valid: true,
            sanitized: { option: 'Other (Please Specify)', otherText: '2' },
        });
        expect(invalidResult.valid).toBe(false);
    });
    it('treats question 24 as a whole-number FTE count, not a radio', () => {
        expect(validateAnswer('24', '4')).toEqual({ valid: true, sanitized: 4 });
        expect(validateAnswer('24', 4.5).valid).toBe(false);
    });
    // Q21 was free text during Pass 1 and became numeric in Pass 7. The
    // "an estimate is acceptable" qualifier lives in the question text, so
    // the field itself only has to accept an integer — it does not have to
    // be exact. Free-text answers are now rejected; centres that cannot
    // produce a figure are directed to leave the field blank.
    it('accepts an integer for question 21 (radio keyups) and rejects free text', () => {
        expect(validateAnswer('21', '87600')).toEqual({ valid: true, sanitized: 87600 });
        expect(validateAnswer('21', '43800000')).toEqual({ valid: true, sanitized: 43800000 });
        // Beyond the 100,000,000/yr cap (roughly 11,400 keyups/hr sustained).
        expect(validateAnswer('21', '100000001').valid).toBe(false);
        // An "estimate" must still be written as a number.
        expect(validateAnswer('21', 'approx 1.2 million').valid).toBe(false);
        expect(validateAnswer('21', '12.5').valid).toBe(false);
        expect(validateAnswer('21', '-5').valid).toBe(false);
    });
    it('rejects a bare non-number for question 20 but accepts digits', () => {
        expect(validateAnswer('20', 'n/a').valid).toBe(false);
        expect(validateAnswer('20', '4200')).toEqual({ valid: true, sanitized: 4200 });
    });
    it('rejects answers for info-only sections', () => {
        const result = validateAnswer('0', 'anything');
        expect(result.valid).toBe(false);
    });
    // Regression guard: question IDs in survey_data.json were renumbered at some
    // point and QUESTION_SCHEMA was not updated to match, which silently
    // rejected a batch of questions at POST /api/answers. This walks every
    // question declared in the survey and asserts the validator knows it and
    // agrees with its declared type. (It also catches orphaned schema keys — an
    // entry in QUESTION_SCHEMA that no longer exists in the survey.)
    describe('schema coverage for survey_data.json', () => {
        const surveyPath = new URL('../src/data/survey_data.json', import.meta.url);
        const survey = JSON.parse(readFileSync(surveyPath, 'utf8'));
        const questions = survey.sections.flatMap((s) => s.questions);
        const probeFor = (type, options) => {
            switch (type) {
                case 'number': return '1'; // client posts numeric strings
                case 'number-or-unknown': return '1'; // sentinel covered separately
                case 'text': return 'probe';
                case 'select':
                case 'radio': return options?.[0] ?? 'probe';
                case 'checkbox': return []; // empty selection is always valid
                case 'agencies-with-count': return [];
                default: return 'probe';
            }
        };
        it('declares at least one question to check', () => {
            expect(questions.length).toBeGreaterThan(0);
        });
        // The reverse direction: a renumbering/removal can leave stale keys in
        // QUESTION_SCHEMA that silently accept answers for questions that no
        // longer exist. Assert the validator knows no IDs the survey doesn't.
        it('has no stale QUESTION_SCHEMA entries for removed questions', () => {
            const surveyIds = new Set(questions.map((q) => String(q.id)));
            const orphans = getSchemaQuestionIds().filter((id) => !surveyIds.has(id));
            expect(orphans, `QUESTION_SCHEMA still knows question IDs absent from survey_data.json: ${orphans.join(', ')}`).toEqual([]);
        });
        it.each(questions.map((q) => [String(q.id), q.type, q.options]))('validator knows question %s and agrees it is a %s', (id, type, options) => {
            if (type === 'info') {
                // Info blocks must be known, and must reject any posted answer.
                const result = validateAnswer(id, 'probe');
                expect(result.valid).toBe(false);
                if (!result.valid) {
                    expect(result.reason).not.toContain('Unknown question ID');
                    expect(result.reason).toContain('informational');
                }
                return;
            }
            const result = validateAnswer(id, probeFor(type, options));
            const reason = result.valid ? '' : result.reason;
            expect(result.valid, `question ${id} declared "${type}" but was rejected: ${reason}`).toBe(true);
        });
        // Every number-or-unknown question must carry an unknownOption, and it
        // must equal the sentinel the validator accepts. The client sends this
        // exact string, so drift here would silently reject every "Unknown".
        const unknownQuestions = questions.filter((q) => q.type === 'number-or-unknown');
        it('declares at least one number-or-unknown question', () => {
            expect(unknownQuestions.length).toBeGreaterThan(0);
        });
        it.each(unknownQuestions.map((q) => [String(q.id), q.unknownOption]))('question %s unknownOption matches the accepted sentinel', (id, unknownOption) => {
            expect(unknownOption).toBe(UNKNOWN_VALUE);
            const result = validateAnswer(id, UNKNOWN_VALUE);
            expect(result.valid, `question ${id} rejected the Unknown sentinel`).toBe(true);
            if (result.valid) {
                expect(result.sanitized).toBe(UNKNOWN_VALUE);
            }
            // A near-miss is a typo, not an "unknown".
            expect(validateAnswer(id, 'unknown').valid).toBe(false);
            expect(validateAnswer(id, 'N/A').valid).toBe(false);
            expect(validateAnswer(id, 'UNKOWN').valid).toBe(false);
            // Numeric behaviour is unchanged alongside the sentinel.
            // (integerOnly is not asserted here: Q20/Q21 reject decimals,
            // Q40 accepts them. That difference is covered by the
            // per-question tests above.)
            expect(validateAnswer(id, '0')).toEqual({ valid: true, sanitized: 0 });
            expect(validateAnswer(id, '-1').valid).toBe(false);
            expect(validateAnswer(id, '100000001').valid).toBe(false);
            // Unchecking the box posts an empty string. That must clear
            // the answer, not record a zero — `Number('') === 0`.
            expect(validateAnswer(id, '')).toEqual({ valid: true, sanitized: null });
            expect(validateAnswer(id, '   ')).toEqual({ valid: true, sanitized: null });
        });
    });
});
