import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DatabaseSchema, SubmissionWithAnswers, SubmissionRecord } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database
const file = path.join(__dirname, 'survey_responses.json');
const adapter = new JSONFile<DatabaseSchema>(file);
const defaultData: DatabaseSchema = { submissions: [], answers: [] };
const db = new Low<DatabaseSchema>(adapter, defaultData);

// Read database
await db.read();
db.data ||= defaultData;

export const saveResponse = async (submissionId: string, questionId: string, answer: unknown): Promise<void> => {
  await db.read();
  
  // Remove existing answer for this question
  db.data!.answers = db.data!.answers.filter(
    a => !(a.submission_id === submissionId && a.question_id === questionId)
  );
  
  // Add new answer
  db.data!.answers.push({
    submission_id: submissionId,
    question_id: questionId,
    answer,
    created_at: new Date().toISOString()
  });
  
  await db.write();
};

export const createSubmission = async (submissionId: string): Promise<void> => {
  await db.read();
  
  db.data!.submissions.push({
    submission_id: submissionId,
    created_at: new Date().toISOString(),
    completed: false
  });
  
  await db.write();
};

export const markSubmissionComplete = async (submissionId: string): Promise<void> => {
  await db.read();
  
  const submission = db.data!.submissions.find(s => s.submission_id === submissionId);
  if (submission) {
    submission.completed = true;
    await db.write();
  }
};

export const getSubmission = async (submissionId: string): Promise<SubmissionWithAnswers | null> => {
  await db.read();
  
  const submission = db.data!.submissions.find(s => s.submission_id === submissionId);
  if (!submission) return null;

  const answers = db.data!.answers.filter(a => a.submission_id === submissionId);

  return {
    ...submission,
    answers: answers.reduce((acc, { question_id, answer }) => {
      acc[question_id] = answer;
      return acc;
    }, {} as Record<string, unknown>)
  };
};

export const getAllSubmissions = async (): Promise<SubmissionRecord[]> => {
  await db.read();
  return db.data!.submissions.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
};

export default db;
