import React, { useState } from 'react';
import glossaryData from '../data/glossary_data.json';
import type { GlossaryItem } from '../types';

const typedGlossaryData = glossaryData as GlossaryItem[];

const Glossary: React.FC = () => {
    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <>
            <button
                className="glossary-toggle"
                onClick={() => setIsOpen(!isOpen)}
            >
                {isOpen ? 'Close Glossary' : 'Open Glossary'}
            </button>

            <div className={`glossary-panel ${isOpen ? 'open' : ''}`}>
                <h3>Glossary</h3>
                <ul className="glossary-list">
                    {typedGlossaryData.map((item, idx) => (
                        <li key={idx}>
                            <strong>{item.nenaTerm ?? item.term}</strong>: {item.definition}
                            {item.localNote && (
                                <span style={{ color: '#666', fontSize: '0.9em' }}> {item.localNote}</span>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );
};

export default Glossary;
