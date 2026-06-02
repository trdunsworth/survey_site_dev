import React from 'react';
import Layout from './components/Layout';
import SurveyLanding from './components/SurveyLanding';

function App(): React.ReactElement {
    return (
        <Layout>
            <SurveyLanding />
        </Layout>
    );
}

export default App;
