// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateAnswer } from './answerValidator';

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

    it('requires positive numeric otherText for question 31 (shift length)', () => {
        const validResult = validateAnswer('31', { option: 'Other (Please Specify)', otherText: '2' });
        const invalidResult = validateAnswer('31', { option: 'Other (Please Specify)', otherText: '-1' });

        expect(validResult).toEqual({
            valid: true,
            sanitized: { option: 'Other (Please Specify)', otherText: '2' },
        });
        expect(invalidResult.valid).toBe(false);
    });

    it('treats question 29 as a whole-number FTE count, not a radio', () => {
        expect(validateAnswer('29', '4')).toEqual({ valid: true, sanitized: 4 });
        expect(validateAnswer('29', 4.5).valid).toBe(false);
    });

    it('accepts free text for question 22 (radio keyups) and rejects a bare number for question 20', () => {
        expect(validateAnswer('22', 'approx 1.2 million')).toEqual({
            valid: true,
            sanitized: 'approx 1.2 million',
        });
        expect(validateAnswer('20', 'n/a').valid).toBe(false);
        expect(validateAnswer('20', '4200')).toEqual({ valid: true, sanitized: 4200 });
    });

    it('rejects answers for info-only sections', () => {
        const result = validateAnswer('0', 'anything');

        expect(result.valid).toBe(false);
    });

    // Regression guard: question IDs in survey_data.json were renumbered at some
    // point and QUESTION_SCHEMA was not updated to match, which silently
    // rejected 10 of 46 questions at POST /api/answers. This walks every
    // question declared in the survey and asserts the validator knows it and
    // agrees with its declared type.
    describe('schema coverage for survey_data.json', () => {
        const surveyPath = new URL('../src/data/survey_data.json', import.meta.url);
        const survey = JSON.parse(readFileSync(surveyPath, 'utf8')) as {
            sections: {
                questions: { id: string | number; type: string; options?: string[] }[];
            }[];
        };
        const questions = survey.sections.flatMap((s) => s.questions);

        const probeFor = (type: string, options?: string[]): unknown => {
            switch (type) {
                case 'number':   return '1';            // client posts numeric strings
                case 'text':     return 'probe';
                case 'select':
                case 'radio':    return options?.[0] ?? 'probe';
                case 'checkbox': return [];             // empty selection is always valid
                case 'agencies-with-count': return [];
                default:         return 'probe';
            }
        };

        it('declares at least one question to check', () => {
            expect(questions.length).toBeGreaterThan(0);
        });

        it.each(questions.map((q) => [String(q.id), q.type, q.options]))(
            'validator knows question %s and agrees it is a %s',
            (id: string, type: string, options: string[] | undefined) => {
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
            },
        );
    });
});
