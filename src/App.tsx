import React from 'react';
import Layout from './components/Layout';
import SurveyLanding from './components/SurveyLanding';
import AnalyticsDashboard from './components/AnalyticsDashboard';

function isDashboardView(): boolean {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'dashboard';
}

function App(): React.ReactElement {
    return (
        <Layout>
            {isDashboardView() ? <AnalyticsDashboard /> : <SurveyLanding />}
        </Layout>
    );
}

export default App;
