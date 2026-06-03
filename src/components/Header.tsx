import React from 'react';

function isDashboardView(): boolean {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'dashboard';
}

const Header: React.FC = () => {
    const dashboard = isDashboardView();

    return (
        <header style={styles.header}>
            <div className="container" style={styles.container}>
                <div style={styles.logo}>
                    <span style={styles.nenaText}>NENA</span>
                    <span style={styles.surveyText}> | 9-1-1 OPERATION SURVEY</span>
                </div>
                <nav style={styles.nav} aria-label="Primary">
                    <a href="/" style={dashboard ? styles.navLink : styles.navLinkActive}>Survey</a>
                    <a href="/?view=dashboard" style={dashboard ? styles.navLinkActive : styles.navLink}>Dashboard</a>
                </nav>
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
    nav: {
        display: 'flex',
        gap: '0.75rem',
    },
    navLink: {
        color: 'white',
        fontSize: '0.9rem',
        opacity: 0.85,
        border: '1px solid rgba(255,255,255,0.45)',
        borderRadius: '999px',
        padding: '0.25rem 0.7rem',
        textDecoration: 'none',
    },
    navLinkActive: {
        color: 'var(--nena-red)',
        backgroundColor: 'white',
        fontSize: '0.9rem',
        border: '1px solid white',
        borderRadius: '999px',
        padding: '0.25rem 0.7rem',
        textDecoration: 'none',
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
