import React from 'react';

const Header: React.FC = () => {
    return (
        <header style={styles.header}>
            <div className="container" style={styles.container}>
                <div style={styles.logo}>
                    <span style={styles.nenaText}>NENA</span>
                    <span style={styles.surveyText}> | 9-1-1 OPERATION SURVEY</span>
                </div>
            </div>
        </header>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    header: {
        backgroundColor: 'var(--nena-red)',
        color: 'white',
        padding: '1rem 0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    },
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    logo: {
        fontSize: '1.5rem',
        fontWeight: 'bold',
        display: 'flex',
        gap: '0.5rem'
    },
    nenaText: {
        color: 'white'
    },
    surveyText: {
        color: 'white',
        fontWeight: 'normal'
    }
};

export default Header;
