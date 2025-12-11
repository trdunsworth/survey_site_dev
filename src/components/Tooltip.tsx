import React, { useState, ReactNode } from 'react';

interface TooltipProps {
    text: string;
    children: ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
    const [isVisible, setIsVisible] = useState<boolean>(false);

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
