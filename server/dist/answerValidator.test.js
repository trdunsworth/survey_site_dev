// @vitest-environment node
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
    it('requires positive numeric otherText for question 29', () => {
        const validResult = validateAnswer('29', { option: 'Other (Please Specify)', otherText: '2' });
        const invalidResult = validateAnswer('29', { option: 'Other (Please Specify)', otherText: '-1' });
        expect(validResult).toEqual({
            valid: true,
            sanitized: { option: 'Other (Please Specify)', otherText: '2' },
        });
        expect(invalidResult.valid).toBe(false);
    });
    it('rejects answers for info-only sections', () => {
        const result = validateAnswer('0', 'anything');
        expect(result.valid).toBe(false);
    });
});
