import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Question from './Question';
import surveyData from '../data/survey_data.json';
import type { SurveyData, Answers, AnswerValue, Question as QuestionType } from '../types';
import { useSubject, useObservable } from '../hooks/useObservable';
import {
    createAutoSaveStream,
    createSubmission,
    completeSubmission,
    loadSubmission,
    networkStatus$,
    OfflineSaveQueue,
    type AnswerChange,
} from '../services/surveyService';

const typedSurveyData = surveyData as SurveyData;

// Helper to get URL parameter
const getUrlParam = (name: string): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
};

const SurveyForm: React.FC = () => {
    const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
    const [answers, setAnswers] = useState<Answers>({});
    const [submissionId, setSubmissionId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showResumeLink, setShowResumeLink] = useState<boolean>(false);

    // RxJS Subject for answer changes
    const answerChange$ = useSubject<AnswerChange>();

    // Offline queue for when network is unavailable
    const offlineQueue = useMemo(() => new OfflineSaveQueue(), []);

    // Network status
    const isOnline = useObservable(networkStatus$, navigator.onLine);

    const sections = typedSurveyData.sections;
    const currentSection = sections[currentSectionIndex];

    const normalizeAnswer = (answer: AnswerValue | undefined): string[] => {
        if (answer === undefined || answer === null) return [];
        if (Array.isArray(answer)) {
            return answer.map((item) => {
                if (typeof item === 'object' && item !== null) {
                    if ('option' in item && typeof item.option === 'string') return item.option;
                    if ('agency' in item && typeof (item as any).agency === 'string') return (item as any).agency;
                }
                return String(item);
            });
        }
        if (typeof answer === 'object') {
            if ('option' in answer && typeof answer.option === 'string') return [answer.option];
            if ('agency' in (answer as any) && typeof (answer as any).agency === 'string') return [(answer as any).agency];
        }
        return [String(answer)];
    };

    const isQuestionVisible = useCallback((question: QuestionType): boolean => {
        if (!question.showIf) return true;
        const dependencyAnswers = normalizeAnswer(answers[question.showIf.questionId]);
        return dependencyAnswers.some((val) => question.showIf!.anyOf.includes(val));
    }, [answers]);

    // Generate submission ID on mount or resume existing
    useEffect(() => {
        // Check URL for resume ID
        const resumeId = getUrlParam('id');
        
        // Check localStorage for existing ID
        const storedId = localStorage.getItem('survey_submission_id');
        
        if (resumeId) {
            // Resume from URL
            console.log('Resuming survey from URL:', resumeId);
            setIsLoading(true);
            
            loadSubmission(resumeId).subscribe({
                next: (result) => {
                    if (result.success && result.data) {
                        if (!result.data.completed) {
                            setSubmissionId(resumeId);
                            setAnswers(result.data.answers || {});
                            
                            // Restore section progress
                            const storedSection = localStorage.getItem(`survey_section_${resumeId}`);
                            if (storedSection) {
                                setCurrentSectionIndex(parseInt(storedSection, 10));
                            }
                            
                            localStorage.setItem('survey_submission_id', resumeId);
                            console.log('Successfully resumed survey');
                        } else {
                            console.log('Survey already completed');
                            alert('This survey has already been completed.');
                        }
                    } else {
                        console.error('Failed to load submission:', result.error);
                        alert('Could not resume survey. Starting a new one.');
                        startNewSurvey();
                    }
                    setIsLoading(false);
                },
                error: (err) => {
                    console.error('Error loading submission:', err);
                    alert('Could not resume survey. Starting a new one.');
                    startNewSurvey();
                    setIsLoading(false);
                }
            });
        } else if (storedId) {
            // Resume from localStorage
            console.log('Resuming survey from localStorage:', storedId);
            setIsLoading(true);
            
            loadSubmission(storedId).subscribe({
                next: (result) => {
                    if (result.success && result.data && !result.data.completed) {
                        setSubmissionId(storedId);
                        setAnswers(result.data.answers || {});
                        
                        // Restore section progress
                        const storedSection = localStorage.getItem(`survey_section_${storedId}`);
                        if (storedSection) {
                            setCurrentSectionIndex(parseInt(storedSection, 10));
                        }
                        
                        console.log('Successfully resumed survey from localStorage');
                    } else {
                        startNewSurvey();
                    }
                    setIsLoading(false);
                },
                error: () => {
                    startNewSurvey();
                    setIsLoading(false);
                }
            });
        } else {
            // Start new survey
            startNewSurvey();
            setIsLoading(false);
        }
        
        function startNewSurvey() {
            const id = `survey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            setSubmissionId(id);
            localStorage.setItem('survey_submission_id', id);
            
            // Create submission in database using RxJS
            createSubmission(id).subscribe({
                next: (result) => {
                    if (result.success) {
                        console.log('Submission created successfully');
                    } else {
                        console.error('Failed to create submission:', result.error);
                    }
                },
            });
        }
    }, []);
    
    // Save section progress to localStorage
    useEffect(() => {
        if (submissionId) {
            localStorage.setItem(`survey_section_${submissionId}`, currentSectionIndex.toString());
        }
    }, [currentSectionIndex, submissionId]);

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
            if (!isQuestionVisible(question)) continue;
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
            if (!isQuestionVisible(question)) continue;
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
            completeSubmission(submissionId).subscribe({
                next: (result) => {
                    setIsSaving(false);
                    if (result.success) {
                        // Clear localStorage on successful submission
                        localStorage.removeItem('survey_submission_id');
                        localStorage.removeItem(`survey_section_${submissionId}`);
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
    
    // Copy resume link to clipboard
    const copyResumeLink = (): void => {
        if (submissionId) {
            const resumeUrl = `${window.location.origin}${window.location.pathname}?id=${submissionId}`;
            navigator.clipboard.writeText(resumeUrl).then(() => {
                alert('Resume link copied to clipboard! Save this link to continue your survey later.');
            }).catch(() => {
                alert(`Resume link: ${resumeUrl}`);
            });
        }
    };

    // Calculate progress
    const progress = Math.round(((currentSectionIndex + 1) / sections.length) * 100);

    // Show loading state
    if (isLoading) {
        return (
            <div className="survey-form" style={{ textAlign: 'center', padding: '40px' }}>
                <p>Loading survey...</p>
            </div>
        );
    }

    return (
        <div className="survey-form">
            <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>

            {/* Resume link banner */}
            {submissionId && !showResumeLink && (
                <div style={{
                    padding: '12px',
                    marginBottom: '12px',
                    backgroundColor: '#e7f3ff',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <span style={{ fontSize: '14px', color: '#004085' }}>
                        💡 Want to finish this survey later?
                    </span>
                    <button
                        onClick={() => setShowResumeLink(true)}
                        style={{
                            padding: '6px 12px',
                            fontSize: '13px',
                            backgroundColor: '#0066cc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        Get Resume Link
                    </button>
                </div>
            )}

            {/* Resume link display */}
            {showResumeLink && submissionId && (
                <div style={{
                    padding: '16px',
                    marginBottom: '12px',
                    backgroundColor: '#d4edda',
                    borderRadius: '4px',
                    border: '1px solid #c3e6cb'
                }}>
                    <div style={{ marginBottom: '8px', fontWeight: 'bold', color: '#155724' }}>
                        📋 Your Resume Link
                    </div>
                    <div style={{
                        padding: '8px',
                        backgroundColor: 'white',
                        borderRadius: '3px',
                        marginBottom: '8px',
                        fontSize: '13px',
                        wordBreak: 'break-all',
                        fontFamily: 'monospace'
                    }}>
                        {`${window.location.origin}${window.location.pathname}?id=${submissionId}`}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={copyResumeLink}
                            style={{
                                padding: '6px 12px',
                                fontSize: '13px',
                                backgroundColor: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                            }}
                        >
                            Copy Link
                        </button>
                        <button
                            onClick={() => setShowResumeLink(false)}
                            style={{
                                padding: '6px 12px',
                                fontSize: '13px',
                                backgroundColor: '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                            }}
                        >
                            Close
                        </button>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#155724' }}>
                        ℹ️ Bookmark or save this link to continue your survey from any device.
                    </div>
                </div>
            )}

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
                <span className="step-indicator">
                    Section {currentSectionIndex + 1} of {sections.length}
                    {/* Section navigation with completion indicators */}
                    <div style={{ 
                        marginTop: '12px', 
                        display: 'flex', 
                        gap: '6px', 
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                    }}>
                        {sections.map((section, idx) => {
                            const hasAnswers = section.questions.some(q => 
                                answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== ''
                            );
                            const isCurrent = idx === currentSectionIndex;
                            
                            return (
                                <div
                                    key={idx}
                                    style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        backgroundColor: isCurrent ? '#0066cc' : hasAnswers ? '#28a745' : '#e0e0e0',
                                        color: isCurrent || hasAnswers ? 'white' : '#666',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        border: isCurrent ? '2px solid #004085' : 'none',
                                        boxSizing: 'border-box'
                                    }}
                                    title={`${section.title}${hasAnswers ? ' (has answers)' : ''}`}
                                    onClick={() => setCurrentSectionIndex(idx)}
                                >
                                    {hasAnswers && !isCurrent ? '✓' : idx + 1}
                                </div>
                            );
                        })}
                    </div>
                </span>
            </div>

            <div className="questions-list">
                {currentSection.questions
                    .filter(isQuestionVisible)
                    .map(q => (
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
