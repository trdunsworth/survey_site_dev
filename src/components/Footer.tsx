import React from 'react';

const Footer: React.FC = () => {
    return (
        <footer style={styles.footer}>
            <div className="container">
                <p>&copy; {new Date().getFullYear()} National Emergency Number Association. All rights reserved.</p>
            </div>
        </footer>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    footer: {
        backgroundColor: 'var(--nena-grey)',
        color: 'white',
        padding: '2rem 0',
        textAlign: 'center',
        marginTop: 'auto'
    }
};

export default Footer;
