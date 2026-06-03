import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

vi.mock('./components/Layout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock('./components/SurveyLanding', () => ({
    default: () => <div>Survey Landing View</div>,
}));

vi.mock('./components/AnalyticsDashboard', () => ({
    default: () => <div>Analytics Dashboard View</div>,
}));

describe('App view routing', () => {
    it('renders the survey landing by default', () => {
        window.history.replaceState({}, '', '/');

        render(<App />);

        expect(screen.getByText('Survey Landing View')).toBeInTheDocument();
        expect(screen.queryByText('Analytics Dashboard View')).not.toBeInTheDocument();
    });

    it('renders the dashboard when ?view=dashboard is present', () => {
        window.history.replaceState({}, '', '/?view=dashboard');

        render(<App />);

        expect(screen.getByText('Analytics Dashboard View')).toBeInTheDocument();
        expect(screen.queryByText('Survey Landing View')).not.toBeInTheDocument();
    });
});
