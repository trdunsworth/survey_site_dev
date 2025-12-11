export interface AnswerRecord {
  submission_id: string;
  question_id: string;
  answer: unknown;
  created_at: string;
}

export interface SubmissionRecord {
  submission_id: string;
  created_at: string;
  completed: boolean;
}

export interface DatabaseSchema {
  submissions: SubmissionRecord[];
  answers: AnswerRecord[];
}

export interface SubmissionWithAnswers extends SubmissionRecord {
  answers: Record<string, unknown>;
}
