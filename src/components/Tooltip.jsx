import React, { useState } from 'react';

const Tooltip = ({ text, children }) => {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div
            className="tooltip-container"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
            style={{ display: 'inline-block', position: 'relative', borderBottom: '1px dotted #666' }}
        >
            {children}
            {isVisible && (
                <div className="tooltip-popup">
                    {text}
                </div>
            )}
        </div>
    );
};

export default Tooltip;
