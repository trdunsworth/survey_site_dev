# Survey Database Setup

## Overview

The survey application now includes database integration to store responses for analysis.

## Architecture

- **Frontend**: React app (port 5173)
- **Backend**: Express API server (port 3001)
- **Database**: SQLite (stored in `server/survey_responses.db`)

## Database Schema

### `survey_responses` table
- `id`: Auto-increment primary key
- `submission_id`: Unique identifier for each survey submission
- `created_at`: Timestamp of creation
- `completed`: Boolean flag indicating if survey was submitted

### `question_answers` table
- `id`: Auto-increment primary key
- `submission_id`: Foreign key to survey_responses
- `question_id`: The question ID from survey_data.json
- `answer`: The user's answer (JSON for arrays, string otherwise)
- `created_at`: Timestamp

## Running the Application

### Install dependencies
```bash
npm install
```

### Run both frontend and backend
```bash
npm run dev:all
```

Or run them separately:
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
npm run server
```

## API Endpoints

- `POST /api/submissions` - Create a new submission
- `POST /api/answers` - Save an individual answer
- `POST /api/submissions/:submissionId/complete` - Mark submission as complete
- `GET /api/submissions/:submissionId` - Get a specific submission
- `GET /api/submissions` - Get all submissions
- `GET /api/export/csv` - Export data as CSV

## Features

- **Auto-save**: Answers are automatically saved as users fill out the survey
- **Resume capability**: Users can resume incomplete surveys (future enhancement)
- **Data export**: Export responses to CSV for analysis
- **Easy upgrade**: SQLite can be easily replaced with PostgreSQL/MySQL

## Upgrading to PostgreSQL

To upgrade to PostgreSQL:

1. Install `pg` instead of `better-sqlite3`
2. Update `server/database.js` to use PostgreSQL client
3. Update connection string in environment variables
4. Deploy to a cloud database service

## Data Analysis

Access all submissions via:
```bash
curl http://localhost:3001/api/submissions
```

Export to CSV:
```bash
curl http://localhost:3001/api/export/csv > responses.csv
```
