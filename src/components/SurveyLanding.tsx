import React, { useState } from 'react';
import SurveyForm from './SurveyForm';
import { consumeToken } from '../services/surveyService';
import type { ResumeContext } from '../types';

/** Returns true if the URL already carries resume params that SurveyForm handles itself. */
const hasUrlResume = (): boolean => {
    const params = new URLSearchParams(window.location.search);
    return params.has('t') || params.has('id');
};

const SurveyLanding: React.FC = () => {
    const [mode, setMode] = useState<'landing' | 'survey'>(() =>
        hasUrlResume() ? 'survey' : 'landing'
    );
    const [resumeContext, setResumeContext] = useState<ResumeContext | undefined>(undefined);
    const [codeInput, setCodeInput] = useState<string>('');
    const [codeError, setCodeError] = useState<string | null>(null);
    const [isResuming, setIsResuming] = useState<boolean>(false);

    if (mode === 'survey') {
        return <SurveyForm resumeContext={resumeContext} />;
    }

    const handleStartNew = (): void => {
        setResumeContext(undefined);
        setMode('survey');
    };

    const handleResumeSubmit = (e: React.FormEvent): void => {
        e.preventDefault();
        const code = codeInput.trim();
        if (!code) {
            setCodeError('Please enter your save code.');
            return;
        }
        setCodeError(null);
        setIsResuming(true);
        consumeToken(code).subscribe({
            next: (result) => {
                setIsResuming(false);
                if (result.success && result.context) {
                    setResumeContext(result.context);
                    setMode('survey');
                } else {
                    const reason = result.reason;
                    setCodeError(
                        reason === 'expired'
                            ? 'This save code has expired. Save codes are valid for 30 days.'
                            : 'This save code is invalid or has already been used. Please check and try again.'
                    );
                }
            },
            error: () => {
                setIsResuming(false);
                setCodeError('Unable to verify save code. Please check your connection and try again.');
            },
        });
    };

    return (
        <div className="survey-landing">
            <div className="survey-landing__card">
                <h2 className="survey-landing__title">NENA PSAP Operations Survey</h2>
                <p className="survey-landing__subtitle">
                    Thank you for participating. This survey takes approximately 20–30 minutes.
                    You can save your progress at any time and return using a personal save code.
                </p>

                <button className="survey-landing__start-btn" onClick={handleStartNew}>
                    Start New Survey
                </button>

                <div className="survey-landing__divider">
                    <span>or</span>
                </div>

                <div className="survey-landing__resume">
                    <h3 className="survey-landing__resume-title">Resume a Saved Survey</h3>
                    <p className="survey-landing__resume-desc">
                        Enter the save code you received when you saved your progress.
                    </p>
                    <form onSubmit={handleResumeSubmit} className="survey-landing__resume-form">
                        <input
                            type="text"
                            className="survey-landing__code-input"
                            placeholder="Paste your save code here"
                            value={codeInput}
                            onChange={(e) => {
                                setCodeInput(e.target.value);
                                setCodeError(null);
                            }}
                            autoComplete="off"
                            spellCheck={false}
                        />
                        {codeError && (
                            <p className="survey-landing__code-error" role="alert">
                                {codeError}
                            </p>
                        )}
                        <button
                            type="submit"
                            className="survey-landing__resume-btn"
                            disabled={isResuming}
                        >
                            {isResuming ? 'Verifying…' : 'Resume Survey'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default SurveyLanding;
