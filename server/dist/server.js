import express from 'express';
import cors from 'cors';
import { saveResponse, createSubmission, markSubmissionComplete, getSubmission, getAllSubmissions } from './database';
const app = express();
const PORT = process.env.PORT || 3001;
// Optional API base path to support subfolder hosting (e.g., '/survey')
const API_BASE = process.env.API_BASE || '';
app.use(cors());
app.use(express.json());
// Create a new submission
app.post(`${API_BASE}/api/submissions`, (req, res) => {
    try {
        const { submissionId } = req.body;
        createSubmission(submissionId);
        res.json({ success: true, submissionId });
    }
    catch (error) {
        console.error('Error creating submission:', error);
        res.status(500).json({ error: 'Failed to create submission' });
    }
});
// Save individual answer
app.post(`${API_BASE}/api/answers`, (req, res) => {
    try {
        const { submissionId, questionId, answer } = req.body;
        saveResponse(submissionId, questionId, answer);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error saving answer:', error);
        res.status(500).json({ error: 'Failed to save answer' });
    }
});
// Submit (complete) survey
app.post(`${API_BASE}/api/submissions/:submissionId/complete`, (req, res) => {
    try {
        const { submissionId } = req.params;
        markSubmissionComplete(submissionId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error completing submission:', error);
        res.status(500).json({ error: 'Failed to complete submission' });
    }
});
// Get a specific submission
app.get(`${API_BASE}/api/submissions/:submissionId`, async (req, res) => {
    try {
        const { submissionId } = req.params;
        const submission = await getSubmission(submissionId);
        if (!submission) {
            res.status(404).json({ error: 'Submission not found' });
            return;
        }
        res.json(submission);
    }
    catch (error) {
        console.error('Error fetching submission:', error);
        res.status(500).json({ error: 'Failed to fetch submission' });
    }
});
// Get all submissions (for analysis)
app.get(`${API_BASE}/api/submissions`, async (req, res) => {
    try {
        const submissions = await getAllSubmissions();
        res.json(submissions);
    }
    catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});
// Export data for analysis (CSV format)
app.get(`${API_BASE}/api/export/csv`, async (req, res) => {
    try {
        const submissions = await getAllSubmissions();
        // Simple CSV export - can be enhanced
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=survey_responses.csv');
        let csv = 'Submission ID,Created At,Completed\n';
        submissions.forEach(sub => {
            csv += `${sub.submission_id},${sub.created_at},${sub.completed}\n`;
        });
        res.send(csv);
    }
    catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});
app.listen(PORT, () => {
    console.log(`Survey API server running on http://localhost:${PORT}`);
});
