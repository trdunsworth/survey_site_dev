import React from 'react';
import Header from './Header';
import Footer from './Footer';
import Glossary from './Glossary';

const Layout = ({ children }) => {
    return (
        <div style={styles.wrapper}>
            <Header />
            <main style={styles.main}>
                <div className="container">
                    {children}
                </div>
            </main>
            <Glossary />
            <Footer />
        </div>
    );
};

const styles = {
    wrapper: {
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
    },
    main: {
        flex: 1,
        padding: '2rem 0',
        position: 'relative' // For glossary positioning if needed
    }
};

export default Layout;
