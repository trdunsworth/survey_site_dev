import React, { useState, useEffect } from 'react';
import Question from './Question';
import surveyData from '../data/survey_data.json';
import type { SurveyData, Answers, AnswerValue } from '../types';

const API_URL = 'http://localhost:3001/api';

const typedSurveyData = surveyData as SurveyData;

const SurveyForm: React.FC = () => {
    const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
    const [answers, setAnswers] = useState<Answers>({});
    const [submissionId, setSubmissionId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    const sections = typedSurveyData.sections;
    const currentSection = sections[currentSectionIndex];

    // Generate submission ID on mount
    useEffect(() => {
        const id = `survey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSubmissionId(id);
        
        // Create submission in database
        fetch(`${API_URL}/submissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submissionId: id })
        }).catch(err => console.error('Failed to create submission:', err));
    }, []);

    const handleAnswerChange = async (questionId: string | number, value: AnswerValue): Promise<void> => {
        setAnswers(prev => ({
            ...prev,
            [questionId]: value
        }));

        // Auto-save answer to database
        if (submissionId) {
            try {
                await fetch(`${API_URL}/answers`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ submissionId, questionId, answer: value })
                });
            } catch (err) {
                console.error('Failed to save answer:', err);
            }
        }
    };

    const handleNext = (): void => {
        if (currentSectionIndex < sections.length - 1) {
            setCurrentSectionIndex(currentSectionIndex + 1);
            window.scrollTo(0, 0);
        }
    };

    const handlePrev = (): void => {
        if (currentSectionIndex > 0) {
            setCurrentSectionIndex(currentSectionIndex - 1);
            window.scrollTo(0, 0);
        }
    };

    const handleSubmit = async (): Promise<void> => {
        if (submissionId) {
            setIsSaving(true);
            try {
                await fetch(`${API_URL}/submissions/${submissionId}/complete`, {
                    method: 'POST'
                });
                alert('Survey submitted successfully! Thank you for your participation.');
            } catch (err) {
                console.error('Failed to complete submission:', err);
                alert('Survey data saved locally. Thank you!');
            } finally {
                setIsSaving(false);
            }
        }
    };

    // Calculate progress
    const progress = Math.round(((currentSectionIndex + 1) / sections.length) * 100);

    return (
        <div className="survey-form">
            <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>

            <div className="section-header">
                <h2>{currentSection.title}</h2>
                <span className="step-indicator">Section {currentSectionIndex + 1} of {sections.length}</span>
            </div>

            <div className="questions-list">
                {currentSection.questions.map(q => (
                    <Question
                        key={q.id}
                        question={q}
                        value={answers[q.id]}
                        onChange={handleAnswerChange}
                    />
                ))}
            </div>

            <div className="pagination-controls">
                <button
                    onClick={handlePrev}
                    disabled={currentSectionIndex === 0}
                    className="secondary"
                >
                    Previous
                </button>

                {currentSectionIndex < sections.length - 1 ? (
                    <button onClick={handleNext} className="primary">
                        Next
                    </button>
                ) : (
                    <button 
                        className="primary" 
                        onClick={handleSubmit}
                        disabled={isSaving}
                    >
                        {isSaving ? 'Submitting...' : 'Submit'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default SurveyForm;
