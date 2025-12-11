import React from 'react';
import Tooltip from './Tooltip';
import glossaryData from '../data/glossary_data.json';

const Question = ({ question, value, onChange }) => {
    const { id, text, type, options } = question;

    const isOtherOption = (opt) => /\bother\b/i.test(opt);
    const selectedRadioValue = typeof value === 'object' && value !== null ? value.option : value;

    // Helper to highlight terms
    const renderTextWithTooltips = (displayText) => {
        // Sort terms by length descending to match longest phrases first
        const sortedTerms = [...glossaryData].sort((a, b) => b.term.length - a.term.length);

        // Create a regex pattern
        // precise matching for acronyms to avoid partial word matches (e.g. "ISO" inside "isolation")
        // This is a naive implementation; for production, use a more robust parser.
        // We'll use word boundaries \b for checking.

        let parts = [displayText];

        sortedTerms.forEach(item => {
            const term = item.term;
            const definition = item.definition;
            const regex = new RegExp(`\\b(${term})\\b`, 'gi');

            const newParts = [];
            parts.forEach(part => {
                if (typeof part === 'string') {
                    // Split by regex
                    const split = part.split(regex);
                    // If split has length > 1, we found matches
                    if (split.length > 1) {
                        for (let i = 0; i < split.length; i++) {
                            // Determine if this part is the match
                            // split indices: 0=non-match, 1=match, 2=non-match... (if capturing group used)
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

    const renderInput = () => {
        switch (type) {
            case 'textarea':
                return (
                    <textarea
                        id={`q-${id}`}
                        value={value || ''}
                        onChange={(e) => onChange(id, e.target.value)}
                        rows={4}
                    />
                );
            case 'radio':
                return (
                    <div className="options-group">
                        {options.map((opt, idx) => {
                            const isOther = isOtherOption(opt);
                            const isSelected = selectedRadioValue === opt;
                            const otherText = typeof value === 'object' && value !== null ? value.otherText || '' : '';

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
                                                    onChange(id, { option: opt, otherText });
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
                                            onChange={(e) => onChange(id, { option: opt, otherText: e.target.value })}
                                            style={{ marginLeft: '1.9rem', marginTop: '0.35rem' }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            case 'checkbox':
                const currentVals = Array.isArray(value) ? value : [];
                const getOptionKey = (v) => (typeof v === 'object' && v !== null ? v.option : v);

                return (
                    <div className="options-group">
                        {options.map((opt, idx) => {
                            const isOther = isOtherOption(opt);
                            const matching = currentVals.find(v => getOptionKey(v) === opt);
                            const isChecked = Boolean(matching);
                            const otherText = typeof matching === 'object' && matching !== null ? matching.otherText || '' : '';

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
                                                    const newEntry = isOther ? { option: opt, otherText } : opt;
                                                    onChange(id, [...currentVals, newEntry]);
                                                } else {
                                                    onChange(id, currentVals.filter(v => getOptionKey(v) !== opt));
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
                                                    if (getOptionKey(v) === opt) {
                                                        return { option: opt, otherText: e.target.value };
                                                    }
                                                    return v;
                                                });
                                                onChange(id, updated);
                                            }}
                                            style={{ marginLeft: '1.9rem', marginTop: '0.35rem' }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            case 'select':
                return (
                    <select
                        id={`q-${id}`}
                        value={value || ''}
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
                const agenciesList = Array.isArray(value) ? value : [];
                
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
                                                    const newEntry = { agency, count: '', ...(isOther && { otherType: '' }) };
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
                        value={value || ''}
                        onChange={(e) => onChange(id, e.target.value)}
                    />
                );
            case 'text':
            default:
                return (
                    <input
                        type="text"
                        id={`q-${id}`}
                        value={value || ''}
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
            </label>
            <div className="input-wrapper">
                {renderInput()}
            </div>
        </div>
    );
};

export default Question;
