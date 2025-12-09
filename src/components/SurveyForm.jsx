import React, { useState, useEffect } from 'react';
import Question from './Question';
import surveyData from '../data/survey_data.json';
import glossaryData from '../data/glossary_data.json';

const SurveyForm = () => {
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [glossaryRes, setGlossaryRes] = useState(null); // Term to show def for

    const sections = surveyData.sections;
    const currentSection = sections[currentSectionIndex];

    const handleAnswerChange = (questionId, value) => {
        setAnswers(prev => ({
            ...prev,
            [questionId]: value
        }));
    };

    const handleNext = () => {
        if (currentSectionIndex < sections.length - 1) {
            setCurrentSectionIndex(currentSectionIndex + 1);
            window.scrollTo(0, 0);
        }
    };

    const handlePrev = () => {
        if (currentSectionIndex > 0) {
            setCurrentSectionIndex(currentSectionIndex - 1);
            window.scrollTo(0, 0);
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
                    <button className="primary" onClick={() => alert('Survey Completed! (Demo)')}>
                        Submit
                    </button>
                )}
            </div>
        </div>
    );
};

export default SurveyForm;
