import React, { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import Glossary from './Glossary';

interface LayoutProps {
    children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
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

const styles: { [key: string]: React.CSSProperties } = {
    wrapper: {
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
    },
    main: {
        flex: 1,
        padding: '2rem 0',
        position: 'relative'
    }
};

export default Layout;
