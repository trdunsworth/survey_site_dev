export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface QuestionOption {
  option: string;
  otherText?: string;
}

export interface AgencyData {
  agency: string;
  count: string;
  otherType?: string;
}

export type AnswerValue = 
  | string 
  | QuestionOption 
  | (string | QuestionOption | AgencyData)[] 
  | AgencyData[];

export interface Question {
  id: string | number;
  text: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'select' | 'number' | 'agencies-with-count' | string;
  options?: string[];
}

export interface Section {
  title: string;
  questions: Question[];
}

export interface SurveyData {
  sections: Section[];
}

export interface Answers {
  [questionId: string]: AnswerValue;
  [questionId: number]: AnswerValue;
}

export interface Submission {
  submission_id: string;
  created_at: string;
  completed: boolean;
}

export interface Answer {
  submission_id: string;
  question_id: string;
  answer: AnswerValue;
  created_at: string;
}
