import fs from 'fs';
import path from 'path';

const mdPath = path.resolve('NENA Survey.md');
const outPath = path.resolve('src/data/survey_data.json');

const content = fs.readFileSync(mdPath, 'utf-8');
const lines = content.split('\n');

const survey = {
    title: "NENA Survey",
    sections: []
};

let currentSection = null;
let currentQuestion = null;

const sectionRegex = /^##\s+(.+)/;
const questionRegex = /^(\d+)\.\s+(.+)/;
const optionRegex = /^\s*[\*\-]\s+(.+)/;

lines.forEach(line => {
    line = line.trimRight(); // Keep indentation for options detection? No, regex handles whitespace.

    // Check for Section
    const sectionMatch = line.match(sectionRegex);
    if (sectionMatch) {
        currentSection = {
            title: sectionMatch[1].trim(),
            questions: []
        };
        survey.sections.push(currentSection);
        currentQuestion = null;
        return;
    }

    // Check for Question
    const questionMatch = line.match(questionRegex);
    if (questionMatch) {
        // If we don't have a section yet, create a default one (or ignore?)
        if (!currentSection) {
            currentSection = { title: "General", questions: [] };
            survey.sections.push(currentSection);
        }

        currentQuestion = {
            id: parseInt(questionMatch[1]),
            text: questionMatch[2].trim(),
            options: [],
            type: 'text' // Default to text, change if options found
        };
        currentSection.questions.push(currentQuestion);
        return;
    }

    // Check for Options
    const optionMatch = line.match(optionRegex);
    if (optionMatch && currentQuestion) {
        currentQuestion.options.push(optionMatch[1].trim());
        // Heuristic: If options exist, it's likely radio or checkbox.
        // If options are > 0, set type to 'select' or 'radio'. 
        // We'll refine this logic. For now default to 'radio' if options exist.
        currentQuestion.type = 'radio';
    }
});

// Post-processing to refine types
survey.sections.forEach(section => {
    section.questions.forEach(q => {
        if (q.options.length > 0) {
            // Check if "Select all that apply" is in text? Not in this MD, usually "Select..." implies radio?
            // "Please list any..." -> Textarea?
            // "Types of calls answered..." -> Checkbox?
            // Heuristic: If options, assume radio unless text hint says otherwise.
            // For this specific survey, let's look at examples.
            // "Types of calls answered by PSAP:" -> likely checkbox? 
            // "Classify the service area:" -> single choice (radio).
            // Manual review might be needed, but strictly radio/select for now is safe.
            q.type = 'radio';
        } else {
            // No options. Likely text input.
            // "Total of..." -> number
            if (q.text.toLowerCase().includes('total') || q.text.toLowerCase().includes('number') || q.text.toLowerCase().includes('count')) {
                q.type = 'number';
            } else if (q.text.toLowerCase().includes('percent')) {
                q.type = 'number';
            }
        }
    });
});

fs.writeFileSync(outPath, JSON.stringify(survey, null, 2));
console.log(`Generated survey data with ${survey.sections.length} sections.`);
