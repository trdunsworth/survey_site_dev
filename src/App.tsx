import React from 'react';
import Layout from './components/Layout';
import SurveyForm from './components/SurveyForm';

function App(): React.ReactElement {
    return (
        <Layout>
            <SurveyForm />
        </Layout>
    );
}

export default App;
