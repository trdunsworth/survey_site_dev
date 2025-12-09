import React from 'react';
import Tooltip from './Tooltip';
import glossaryData from '../data/glossary_data.json';

const Question = ({ question, value, onChange }) => {
    const { id, text, type, options } = question;

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
                        {options.map((opt, idx) => (
                            <label key={idx} className="radio-label">
                                <input
                                    type="radio"
                                    name={`q-${id}`}
                                    value={opt}
                                    checked={value === opt}
                                    onChange={(e) => onChange(id, e.target.value)}
                                />
                                {opt}
                            </label>
                        ))}
                    </div>
                );
            case 'checkbox':
                const currentVals = Array.isArray(value) ? value : [];
                return (
                    <div className="options-group">
                        {options.map((opt, idx) => (
                            <label key={idx} className="checkbox-label">
                                <input
                                    type="checkbox"
                                    name={`q-${id}`}
                                    value={opt}
                                    checked={currentVals.includes(opt)}
                                    onChange={(e) => {
                                        const newValue = e.target.checked
                                            ? [...currentVals, opt]
                                            : currentVals.filter(v => v !== opt);
                                        onChange(id, newValue);
                                    }}
                                />
                                {opt}
                            </label>
                        ))}
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
