import React, { ReactNode } from 'react';
import Tooltip from './Tooltip';
import glossaryData from '../data/glossary_data.json';
import type { Question as QuestionType, AnswerValue, QuestionOption, AgencyData, GlossaryItem } from '../types';

interface QuestionProps {
    question: QuestionType;
    value: AnswerValue | undefined;
    onChange: (questionId: string | number, value: AnswerValue) => void;
}

const typedGlossaryData = glossaryData as GlossaryItem[];

const Question: React.FC<QuestionProps> = ({ question, value, onChange }) => {
    const { id, text, type, options } = question;

    const isOtherOption = (opt: string): boolean => /\bother\b/i.test(opt);
    const selectedRadioValue = typeof value === 'object' && value !== null && 'option' in value ? value.option : value;

    // Helper to highlight terms
    const renderTextWithTooltips = (displayText: string): (string | ReactNode)[] => {
        // Sort terms by length descending to match longest phrases first
        const sortedTerms = [...typedGlossaryData].sort((a, b) => b.term.length - a.term.length);

        let parts: (string | ReactNode)[] = [displayText];

        sortedTerms.forEach(item => {
            const term = item.term;
            const definition = item.definition;
            const regex = new RegExp(`\\b(${term})\\b`, 'gi');

            const newParts: (string | ReactNode)[] = [];
            parts.forEach(part => {
                if (typeof part === 'string') {
                    const split = part.split(regex);
                    if (split.length > 1) {
                        for (let i = 0; i < split.length; i++) {
                            const segment = split[i];
                            if (segment.toLowerCase() === term.toLowerCase()) {
                                newParts.push(
                                    <Tooltip key={`${id}-${term}-${i}`} text={definition}>
                                        <span className="tooltip-trigger">{segment}</span>
                                    </Tooltip>
                                );
                            } else {
                                newParts.push(segment);
                            }
                        }
                    } else {
                        newParts.push(part);
                    }
                } else {
                    newParts.push(part);
                }
            });
            parts = newParts;
        });

        return parts;
    };

    const renderInput = (): ReactNode => {
        switch (type) {
            case 'textarea':
                return (
                    <textarea
                        id={`q-${id}`}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => onChange(id, e.target.value)}
                        rows={4}
                    />
                );
            case 'radio':
                if (!options) return null;
                return (
                    <div className="options-group">
                        {options.map((opt, idx) => {
                            const isOther = isOtherOption(opt);
                            const isSelected = selectedRadioValue === opt;
                            const otherText = typeof value === 'object' && value !== null && 'otherText' in value ? value.otherText || '' : '';

                            return (
                                <div key={idx} className="radio-label">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="radio"
                                            name={`q-${id}`}
                                            value={opt}
                                            checked={isSelected}
                                            onChange={() => {
                                                if (isOther) {
                                                    onChange(id, { option: opt, otherText } as QuestionOption);
                                                } else {
                                                    onChange(id, opt);
                                                }
                                            }}
                                        />
                                        {opt}
                                    </label>
                                    {isOther && isSelected && (
                                        <input
                                            type="text"
                                            placeholder="Please specify"
                                            value={otherText}
                                            onChange={(e) => onChange(id, { option: opt, otherText: e.target.value } as QuestionOption)}
                                            style={{ marginLeft: '1.9rem', marginTop: '0.35rem' }}
                                            required
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            case 'checkbox':
                if (!options) return null;
                const currentVals = Array.isArray(value) ? value : [];
                const getOptionKey = (v: string | QuestionOption): string => (typeof v === 'object' && v !== null ? v.option : v);

                return (
                    <div className="options-group">
                        {options.map((opt, idx) => {
                            const isOther = isOtherOption(opt);
                            const matching = currentVals.find(v => getOptionKey(v as string | QuestionOption) === opt);
                            const isChecked = Boolean(matching);
                            const otherText = typeof matching === 'object' && matching !== null && 'otherText' in matching ? matching.otherText || '' : '';

                            return (
                                <div key={idx} className="checkbox-label">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="checkbox"
                                            name={`q-${id}`}
                                            value={opt}
                                            checked={isChecked}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    const newEntry: string | QuestionOption = isOther ? { option: opt, otherText } : opt;
                                                    onChange(id, [...currentVals, newEntry]);
                                                } else {
                                                    onChange(id, currentVals.filter(v => getOptionKey(v as string | QuestionOption) !== opt));
                                                }
                                            }}
                                        />
                                        {opt}
                                    </label>
                                    {isOther && isChecked && (
                                        <input
                                            type="text"
                                            placeholder="Please specify"
                                            value={otherText}
                                            onChange={(e) => {
                                                const updated = currentVals.map(v => {
                                                    if (getOptionKey(v as string | QuestionOption) === opt) {
                                                        return { option: opt, otherText: e.target.value } as QuestionOption;
                                                    }
                                                    return v;
                                                });
                                                onChange(id, updated);
                                            }}
                                            style={{ marginLeft: '1.9rem', marginTop: '0.35rem' }}
                                            required
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            case 'select':
                if (!options) return null;
                return (
                    <select
                        id={`q-${id}`}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => onChange(id, e.target.value)}
                    >
                        <option value="">-- Select an option --</option>
                        {options.map((opt, idx) => (
                            <option key={idx} value={opt}>
                                {opt}
                            </option>
                        ))}
                    </select>
                );
            case 'agencies-with-count':
                if (!options) return null;
                const agenciesList = (Array.isArray(value) ? value : []) as AgencyData[];
                
                return (
                    <div className="options-group">
                        {options.map((agency, idx) => {
                            const isOther = isOtherOption(agency);
                            const agencyData = agenciesList.find(a => 
                                typeof a === 'object' && a.agency === agency
                            );
                            const isChecked = Boolean(agencyData);
                            const count = agencyData?.count || '';
                            const otherType = agencyData?.otherType || '';

                            return (
                                <div key={idx} className="agency-item">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    const newEntry: AgencyData = { agency, count: '', ...(isOther && { otherType: '' }) };
                                                    onChange(id, [...agenciesList, newEntry]);
                                                } else {
                                                    onChange(id, agenciesList.filter(a => 
                                                        !(typeof a === 'object' && a.agency === agency)
                                                    ));
                                                }
                                            }}
                                        />
                                        {agency}
                                    </label>
                                    {isChecked && (
                                        <div style={{ marginLeft: '1.9rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {isOther && (
                                                <input
                                                    type="text"
                                                    placeholder="Specify agency type"
                                                    value={otherType}
                                                    onChange={(e) => {
                                                        const updated = agenciesList.map(a => {
                                                            if (typeof a === 'object' && a.agency === agency) {
                                                                return { ...a, otherType: e.target.value };
                                                            }
                                                            return a;
                                                        });
                                                        onChange(id, updated);
                                                    }}
                                                    required
                                                />
                                            )}
                                            <input
                                                type="number"
                                                placeholder="Number of agencies"
                                                value={count}
                                                onChange={(e) => {
                                                    const updated = agenciesList.map(a => {
                                                        if (typeof a === 'object' && a.agency === agency) {
                                                            return { ...a, count: e.target.value };
                                                        }
                                                        return a;
                                                    });
                                                    onChange(id, updated);
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            case 'number':
                return (
                    <input
                        type="number"
                        id={`q-${id}`}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => onChange(id, e.target.value)}
                    />
                );
            case 'text':
            default:
                return (
                    <input
                        type="text"
                        id={`q-${id}`}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => onChange(id, e.target.value)}
                    />
                );
        }
    };

    return (
        <div className="question-container">
            <label className="question-label" htmlFor={`q-${id}`}>
                <span className="question-number">{id}. </span>
                {renderTextWithTooltips(text)}
                {question.required && <span style={{ color: '#e74c3c', marginLeft: '0.25rem', fontWeight: 'bold' }}>*</span>}
                {question.required && <span style={{ color: '#e74c3c', fontSize: '0.85em', marginLeft: '0.5rem', fontStyle: 'italic' }}>(Required)</span>}
            </label>
            <div className="input-wrapper">
                {renderInput()}
            </div>
        </div>
    );
};

export default Question;
