import React from 'react';
import { of, throwError } from 'rxjs';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SurveyLanding from './SurveyLanding';

vi.mock('./SurveyForm', () => ({
  default: ({ resumeContext }: { resumeContext?: { sourceSubmissionId: string } }) => (
    <div>
      Survey Form View
      {resumeContext?.sourceSubmissionId ? `:${resumeContext.sourceSubmissionId}` : ''}
    </div>
  ),
}));

vi.mock('../services/surveyService', () => ({
  consumeToken: vi.fn(),
}));

import { consumeToken } from '../services/surveyService';

describe('SurveyLanding', () => {
  const consumeTokenMock = vi.mocked(consumeToken);

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('starts in survey mode when URL has resume params', () => {
    window.history.replaceState({}, '', '/?t=abc123');

    render(<SurveyLanding />);

    expect(screen.getByText('Survey Form View')).toBeInTheDocument();
  });

  it('starts a new survey from the start button', async () => {
    const user = userEvent.setup();

    render(<SurveyLanding />);

    await user.click(screen.getByRole('button', { name: 'Start New Survey' }));

    expect(screen.getByText('Survey Form View')).toBeInTheDocument();
  });

  it('shows validation error when resume code is empty', async () => {
    const user = userEvent.setup();

    render(<SurveyLanding />);

    await user.click(screen.getByRole('button', { name: 'Resume Survey' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your save code.');
    expect(consumeTokenMock).not.toHaveBeenCalled();
  });

  it('resumes when token is valid', async () => {
    const user = userEvent.setup();
    consumeTokenMock.mockReturnValueOnce(
      of({
        success: true,
        context: {
          sourceSubmissionId: 'sub-1',
          targetSurveyVersion: 'default',
          targetSectionIndex: 2,
        },
      })
    );

    render(<SurveyLanding />);

    await user.type(screen.getByPlaceholderText('Paste your save code here'), 'save-code-123');
    await user.click(screen.getByRole('button', { name: 'Resume Survey' }));

    await waitFor(() => {
      expect(screen.getByText('Survey Form View:sub-1')).toBeInTheDocument();
    });
    expect(consumeTokenMock).toHaveBeenCalledWith('save-code-123');
  });

  it('shows expired-code message when API returns expired', async () => {
    const user = userEvent.setup();
    consumeTokenMock.mockReturnValueOnce(of({ success: false, reason: 'expired' }));

    render(<SurveyLanding />);

    await user.type(screen.getByPlaceholderText('Paste your save code here'), 'expired-code');
    await user.click(screen.getByRole('button', { name: 'Resume Survey' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('This save code has expired. Save codes are valid for 7 days.');
    });
  });

  it('shows network error when token validation request errors', async () => {
    const user = userEvent.setup();
    consumeTokenMock.mockReturnValueOnce(throwError(() => new Error('network')));

    render(<SurveyLanding />);

    await user.type(screen.getByPlaceholderText('Paste your save code here'), 'network-error-code');
    await user.click(screen.getByRole('button', { name: 'Resume Survey' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Unable to verify save code. Please check your connection and try again.'
      );
    });
  }, 10000);
});
