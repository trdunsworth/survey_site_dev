import React, { useState } from 'react';
import glossaryData from '../data/glossary_data.json';

const Glossary = () => {
    const [isOpen, setIsOpen] = useState(false);

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
                    {glossaryData.map((item, idx) => (
                        <li key={idx}>
                            <strong>{item.term}</strong>: {item.definition}
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );
};

export default Glossary;
