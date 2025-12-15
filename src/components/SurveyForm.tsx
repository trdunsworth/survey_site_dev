import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Question from './Question';
import surveyData from '../data/survey_data.json';
import type { SurveyData, Answers, AnswerValue } from '../types';
import { useSubject, useSubscription, useObservable } from '../hooks/useObservable';
import {
    createAutoSaveStream,
    createSubmission,
    completeSubmission,
    networkStatus$,
    OfflineSaveQueue,
    type AnswerChange,
} from '../services/surveyService';

const typedSurveyData = surveyData as SurveyData;

const SurveyForm: React.FC = () => {
    const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
    const [answers, setAnswers] = useState<Answers>({});
    const [submissionId, setSubmissionId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    // RxJS Subject for answer changes
    const answerChange$ = useSubject<AnswerChange>();

    // Offline queue for when network is unavailable
    const offlineQueue = useMemo(() => new OfflineSaveQueue(), []);

    // Network status
    const isOnline = useObservable(networkStatus$, navigator.onLine);

    const sections = typedSurveyData.sections;
    const currentSection = sections[currentSectionIndex];

    // Generate submission ID on mount
    useEffect(() => {
        const id = `survey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSubmissionId(id);
        
        // Create submission in database using RxJS
        const subscription = createSubmission(id).subscribe({
            next: (result) => {
                if (result.success) {
                    console.log('Submission created successfully');
                } else {
                    console.error('Failed to create submission:', result.error);
                }
            },
        });

        return () => subscription.unsubscribe();
    }, []);

    // Set up auto-save stream with RxJS
    useEffect(() => {
        const autoSave$ = createAutoSaveStream(answerChange$);
        
        const subscription = autoSave$.subscribe({
            next: (result) => {
                if (result.success) {
                    setSaveStatus('saved');
                    setTimeout(() => setSaveStatus('idle'), 2000);
                } else {
                    setSaveStatus('error');
                    setTimeout(() => setSaveStatus('idle'), 3000);
                }
            },
        });

        return () => subscription.unsubscribe();
    }, [answerChange$]);

    // Process offline queue when network comes back online
    useEffect(() => {
        if (isOnline && offlineQueue.getQueueSize() > 0) {
            const subscription = offlineQueue.processQueue().subscribe({
                next: (results) => {
                    const successCount = results.filter((r) => r.success).length;
                    console.log(`Processed ${successCount}/${results.length} queued answers`);
                },
            });

            return () => subscription.unsubscribe();
        }
    }, [isOnline, offlineQueue]);

    const handleAnswerChange = useCallback((questionId: string | number, value: AnswerValue): void => {
        // Update local state immediately (optimistic update)
        setAnswers(prev => ({
            ...prev,
            [questionId]: value
        }));

        // Emit to RxJS stream for debounced auto-save
        if (submissionId) {
            const change: AnswerChange = {
                submissionId,
                questionId,
                answer: value,
            };

            if (isOnline) {
                // Online: send to auto-save stream
                answerChange$.next(change);
                setSaveStatus('saving');
            } else {
                // Offline: add to queue
                offlineQueue.add(change);
                setSaveStatus('error');
            }
        }
    }, [submissionId, answerChange$, isOnline, offlineQueue]);

    const validateRequiredFields = (): boolean => {
        for (const question of currentSection.questions) {
            if (question.required) {
                const answer = answers[question.id];
                
                // Check if answer exists and is not empty
                if (answer === undefined || answer === null || answer === '') {
                    alert(`Question ${question.id} is required. Please provide an answer.`);
                    return false;
                }
                
                // For arrays (checkbox, agencies-with-count), check if not empty
                if (Array.isArray(answer) && answer.length === 0) {
                    alert(`Question ${question.id} is required. Please select at least one option.`);
                    return false;
                }
                
                // For objects (radio with other), check if has value
                if (typeof answer === 'object' && answer !== null && 'option' in answer) {
                    if (!answer.option) {
                        alert(`Question ${question.id} is required. Please select an option.`);
                        return false;
                    }
                }
            }
        }
        return true;
    };

    const validateOtherFields = (): boolean => {
        for (const question of currentSection.questions) {
            const answer = answers[question.id];
            
            // Check radio buttons with "Other"
            if (question.type === 'radio' && typeof answer === 'object' && answer !== null && 'option' in answer) {
                const isOther = /\bother\b/i.test(answer.option);
                if (isOther && (!answer.otherText || answer.otherText.trim() === '')) {
                    alert(`Please specify details for the "Other" option in question ${question.id}.`);
                    return false;
                }
            }
            
            // Check checkboxes with "Other"
            if (question.type === 'checkbox' && Array.isArray(answer)) {
                for (const item of answer) {
                    if (typeof item === 'object' && item !== null && 'option' in item) {
                        const isOther = /\bother\b/i.test(item.option);
                        if (isOther && (!item.otherText || item.otherText.trim() === '')) {
                            alert(`Please specify details for the "Other" option in question ${question.id}.`);
                            return false;
                        }
                    }
                }
            }
            
            // Check agencies-with-count with "Other"
            if (question.type === 'agencies-with-count' && Array.isArray(answer)) {
                for (const item of answer) {
                    if (typeof item === 'object' && item !== null && 'agency' in item) {
                        const isOther = /\bother\b/i.test(item.agency);
                        if (isOther && (!item.otherType || item.otherType.trim() === '')) {
                            alert(`Please specify the agency type for the "Other" option in question ${question.id}.`);
                            return false;
                        }
                    }
                }
            }
        }
        return true;
    };

    const handleNext = (): void => {
        if (!validateRequiredFields() || !validateOtherFields()) {
            return;
        }
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

    const handleSubmit = (): void => {
        if (!validateRequiredFields() || !validateOtherFields()) {
            return;
        }
        if (submissionId) {
            setIsSaving(true);
            
            // Use RxJS observable for submission
            const subscription = completeSubmission(submissionId).subscribe({
                next: (result) => {
                    setIsSaving(false);
                    if (result.success) {
                        alert('Survey submitted successfully! Thank you for your participation.');
                    } else {
                        alert('Survey data saved locally. Thank you!');
                    }
                },
                error: (err) => {
                    setIsSaving(false);
                    console.error('Failed to complete submission:', err);
                    alert('Survey data saved locally. Thank you!');
                },
            });

            // Note: In production, you might want to store this subscription
            // to unsubscribe if component unmounts during submission
        }
    };

    // Calculate progress
    const progress = Math.round(((currentSectionIndex + 1) / sections.length) * 100);

    return (
        <div className="survey-form">
            <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>

            {/* Network and save status indicator */}
            <div style={{ 
                padding: '8px 12px', 
                marginBottom: '12px', 
                borderRadius: '4px',
                backgroundColor: !isOnline ? '#fff3cd' : saveStatus === 'saved' ? '#d4edda' : saveStatus === 'error' ? '#f8d7da' : saveStatus === 'saving' ? '#cfe2ff' : 'transparent',
                color: !isOnline ? '#856404' : saveStatus === 'saved' ? '#155724' : saveStatus === 'error' ? '#721c24' : saveStatus === 'saving' ? '#084298' : 'inherit',
                fontSize: '14px',
                display: (!isOnline || saveStatus !== 'idle') ? 'block' : 'none'
            }}>
                {!isOnline ? '⚠️ Offline - Your answers will be saved when connection is restored' :
                 saveStatus === 'saving' ? '💾 Saving...' :
                 saveStatus === 'saved' ? '✓ Saved' :
                 saveStatus === 'error' ? '⚠️ Save failed - retrying...' : ''}
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
