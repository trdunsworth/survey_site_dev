# MotherDuck WASM Client Integration for NENA Survey

**Static Deployment at `https://census.nena.org`**

---

## Executive Summary

This document outlines the technical approach for integrating **MotherDuck cloud analytics** into the NENA Survey application while maintaining **static hosting** (Option A). The solution uses **@motherduck/wasm-client** — a WebAssembly-based DuckDB client that runs entirely in the browser — to write completed survey responses directly to MotherDuck and query analytics from the cloud.

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Centralized Data** | All PSAP responses aggregated in one MotherDuck database |
| **Real-time Analytics** | NENA team sees live KPI dashboard without collecting files |
| **No Server Required** | Runs entirely in browser; deploys to any static host |
| **Offline-First** | localStorage remains primary; MotherDuck sync is background |
| **Cost Effective** | MotherDuck free tier covers expected volume |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  census.nena.org (Static Host: nginx/S3/Netlify/Azure)         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  React App (Vite build → static/)                         │  │
│  │  • Survey form → localStorage (existing, works offline)   │  │
│  │  • On complete: also INSERT to MotherDuck via WASM       │  │
│  │  • Analytics Dashboard → QUERY MotherDuck via WASM        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼ (HTTPS + COEP/COOP headers)      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  @motherduck/wasm-client (WASM, ~5MB, loads on demand)    │  │
│  │  • Loads DuckDB WASM from https://app.motherduck.com      │  │
│  │  • Authenticates with scoped MotherDuck token             │  │
│  │  • Executes SQL directly against MotherDuck cloud         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  MotherDuck Cloud (Managed DuckDB)                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Database: nena_survey                                     │  │
│  │  • survey_responses  — one row per completed survey       │  │
│  │  • survey_answers    — one row per question answered      │  │
│  │  • survey_analytics  — view for KPI dashboard             │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### 1. MotherDuck Account
- Organization: NENA
- Database: `nena_survey` (to be created)
- Admin access to create scoped tokens

### 2. Static Host Requirements
- HTTPS (required for WASM SharedArrayBuffer)
- Ability to set HTTP headers:
  ```
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Opener-Policy: same-origin
  ```
- MIME type support for `.wasm` files (`application/wasm`)

### 3. Development Environment
- Node.js 18+
- Existing NENA Survey codebase
- Vite build system (already configured)

---

## Security Model: Scoped Tokens

**Critical**: Never expose an admin token in the browser. MotherDuck supports **scoped tokens** with granular permissions.

### Token Creation (Run Once in MotherDuck UI)

```sql
-- 1. Create a role with minimal permissions
CREATE ROLE survey_writer;
GRANT INSERT ON nena_survey.survey_responses TO survey_writer;
GRANT INSERT ON nena_survey.survey_answers TO survey_writer;
-- Optional: allow reading for analytics dashboard
GRANT SELECT ON nena_survey.survey_analytics TO survey_writer;

-- 2. Create a scoped token for that role
CREATE SCOPED TOKEN 'nena-survey-static-2026' 
FOR ROLE survey_writer
COMMENT 'NENA Survey static deployment - INSERT only';
```

### Token Security Properties

| Property | Value | Rationale |
|----------|-------|-----------|
| **Permissions** | INSERT on 2 tables, optional SELECT on view | Least privilege |
| **Expiration** | 2027-12-31 (end of survey period) | Auto-revoke after collection |
| **Storage** | `VITE_MOTHERDUCK_TOKEN` env var at build time | Not in git, not in localStorage |
| **Rotation** | New token per survey year | Annual security hygiene |

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Token leaked in bundle | Scoped to INSERT only; no DROP/DELETE/SELECT on raw tables |
| Malicious payload | Input validated by existing answer validator; JSON serialization |
| Replay attacks | Submission IDs are UUIDs; duplicate inserts fail on PK |
| Token brute force | MotherDuck rate limits; token is 256-bit entropy |

---

## Database Schema (MotherDuck)

Run once in MotherDuck UI before deployment:

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS nena_survey;
USE nena_survey;

-- Main responses table
CREATE TABLE IF NOT EXISTS survey_responses (
  submission_id VARCHAR PRIMARY KEY,
  created_at TIMESTAMP,
  completed_at TIMESTAMP,
  survey_version VARCHAR DEFAULT 'default',
  current_section_index INTEGER DEFAULT 0,
  last_question_id VARCHAR,
  updated_at TIMESTAMP,
  answers_json JSON  -- Full answer payload for export
);

-- Normalized answers for analytics
CREATE TABLE IF NOT EXISTS survey_answers (
  submission_id VARCHAR,
  question_id VARCHAR,
  answer_json JSON,
  created_at TIMESTAMP,
  PRIMARY KEY (submission_id, question_id)
);

-- Analytics view
CREATE VIEW IF NOT EXISTS survey_analytics AS
SELECT 
  r.submission_id,
  r.created_at,
  r.completed_at,
  r.survey_version,
  r.current_section_index,
  r.last_question_id,
  a.question_id,
  a.answer_json
FROM survey_responses r
JOIN survey_answers a ON r.submission_id = a.submission_id;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_responses_completed ON survey_responses(completed_at);
CREATE INDEX IF NOT EXISTS idx_answers_question ON survey_answers(question_id);
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1)

#### 1.1 Install Dependencies
```bash
npm install @motherduck/wasm-client apache-arrow
# Alternative (bundled arrow, larger bundle):
# npm install @motherduck/wasm-client/with-arrow
```

#### 1.2 TypeScript Configuration
```json
// tsconfig.json - ensure WASM types work
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["@motherduck/wasm-client"]
  }
}
```

#### 1.3 Vite Configuration Updates
```typescript
// vite.config.ts
export default defineConfig(({ mode }) => {
  const isStaticMode = mode === 'static' || env.VITE_STATIC_MODE === 'true';
  
  return {
    plugins: [react()],
    base: isStaticMode ? './' : (env.VITE_BASE_PATH || '/'),
    build: {
      outDir: isStaticMode ? 'static' : 'dist',
      emptyOutDir: true,
      // WASM worker needs to be a separate chunk
      rollupOptions: {
        output: {
          manualChunks: {
            'motherduck-wasm': ['@motherduck/wasm-client'],
          },
        },
      },
    },
    // Dev server headers for WASM
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  };
});
```

#### 1.4 Environment Variables
```bash
# .env.production (for static build)
VITE_MOTHERDUCK_TOKEN=your_scoped_token_here
VITE_STATIC_MODE=true
# Optional: custom database name
VITE_MOTHERDUCK_DB=nena_survey
```

---

### Phase 2: Core Integration (Week 1-2)

#### 2.1 MotherDuck Connection Hook
```typescript
// src/hooks/useMotherDuck.ts
import { MDConnection, DuckDBRow } from '@motherduck/wasm-client';
import { useCallback, useEffect, useState } from 'react';

interface MotherDuckState {
  connection: MDConnection | null;
  isInitialized: boolean;
  isConnected: boolean;
  error: string | null;
}

export function useMotherDuck() {
  const [state, setState] = useState<MotherDuckState>({
    connection: null,
    isInitialized: false,
    isConnected: false,
    error: null,
  });

  const connect = useCallback(async (token: string) => {
    try {
      setState(prev => ({ ...prev, error: null, isInitialized: false }));
      
      const connection = MDConnection.create({ mdToken: token });
      await connection.isInitialized();
      
      // Test connection
      await connection.evaluateQuery('SELECT 1 as test');
      
      setState({ 
        connection, 
        isInitialized: true, 
        isConnected: true, 
        error: null 
      });
      
      // Store connection success in sessionStorage for quick reconnect
      sessionStorage.setItem('md_connected', 'true');
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Connection failed',
        isConnected: false 
      }));
      sessionStorage.removeItem('md_connected');
    }
  }, []);

  // Auto-connect from env on mount
  useEffect(() => {
    const token = import.meta.env.VITE_MOTHERDUCK_TOKEN;
    const wasConnected = sessionStorage.getItem('md_connected');
    
    if (token && (wasConnected || !state.isConnected)) {
      connect(token);
    }
  }, [connect, state.isConnected]);

  const executeQuery = useCallback(async (sql: string, params?: unknown[]) => {
    if (!state.connection) throw new Error('Not connected to MotherDuck');
    if (params && params.length > 0) {
      return state.connection.evaluatePreparedStatement(sql, params);
    }
    return state.connection.evaluateQuery(sql);
  }, [state.connection]);

  const executeInsert = useCallback(async (table: string, data: Record<string, unknown>) => {
    if (!state.connection) throw new Error('Not connected to MotherDuck');
    
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    
    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    return state.connection.evaluatePreparedStatement(sql, values);
  }, [state.connection]);

  return { 
    ...state, 
    connect, 
    executeQuery, 
    executeInsert 
  };
}
```

#### 2.2 MotherDuck Service Layer
```typescript
// src/services/motherduckService.ts
import { useMotherDuck } from '../hooks/useMotherDuck';
import type { AnswerValue } from '../types';

export interface SurveySubmission {
  submission_id: string;
  created_at: string;
  completed_at: string;
  survey_version: string;
  current_section_index: number;
  last_question_id: string | null;
  updated_at: string;
  answers: Record<string, AnswerValue>;
}

export interface AnalyticsData {
  totalCompleted: number;
  questionCompletion: Array<{ question_id: string; count: number }>;
  dailyCompletions: Array<{ day: string; count: number }>;
  surveyVersions: Array<{ survey_version: string; count: number }>;
}

export function createMotherDuckService(getState: () => ReturnType<typeof useMotherDuck>) {
  const db = import.meta.env.VITE_MOTHERDUCK_DB || 'nena_survey';
  
  return {
    /**
     * Submit completed survey to MotherDuck
     * Called after localStorage save succeeds
     */
    async submitSurvey(submission: SurveySubmission): Promise<void> {
      const { executeInsert } = getState();
      const fullTable = (t: string) => `${db}.${t}`;
      
      // Insert into survey_responses (flattened + JSON)
      await executeInsert(fullTable('survey_responses'), {
        submission_id: submission.submission_id,
        created_at: submission.created_at,
        completed_at: submission.completed_at,
        survey_version: submission.survey_version,
        current_section_index: submission.current_section_index,
        last_question_id: submission.last_question_id,
        updated_at: submission.updated_at,
        answers_json: JSON.stringify(submission.answers),
      });

      // Insert each answer into survey_answers (normalized)
      const insertPromises = Object.entries(submission.answers).map(
        ([questionId, answer]) => 
          executeInsert(fullTable('survey_answers'), {
            submission_id: submission.submission_id,
            question_id: questionId,
            answer_json: JSON.stringify(answer),
            created_at: submission.completed_at,
          })
      );
      
      await Promise.all(insertPromises);
    },

    /**
     * Fetch aggregated analytics for dashboard
     */
    async fetchAnalytics(): Promise<AnalyticsData> {
      const { executeQuery } = getState();
      const fullTable = (t: string) => `${db}.${t}`;
      
      // Run queries in parallel
      const [
        totalResult,
        questionResult,
        dailyResult,
        versionResult
      ] = await Promise.all([
        executeQuery(`
          SELECT COUNT(*) as total 
          FROM ${fullTable('survey_responses')} 
          WHERE completed_at IS NOT NULL
        `),
        executeQuery(`
          SELECT question_id, COUNT(*) as count
          FROM ${fullTable('survey_answers')}
          GROUP BY question_id
          ORDER BY count DESC
        `),
        executeQuery(`
          SELECT DATE(completed_at) as day, COUNT(*) as count
          FROM ${fullTable('survey_responses')}
          WHERE completed_at >= CURRENT_DATE - INTERVAL '30 days'
            AND completed_at IS NOT NULL
          GROUP BY DATE(completed_at)
          ORDER BY day
        `),
        executeQuery(`
          SELECT survey_version, COUNT(*) as count
          FROM ${fullTable('survey_responses')}
          WHERE completed_at IS NOT NULL
          GROUP BY survey_version
        `),
      ]);

      return {
        totalCompleted: totalResult.data.toRows()[0]?.total ?? 0,
        questionCompletion: questionResult.data.toRows(),
        dailyCompletions: dailyResult.data.toRows(),
        surveyVersions: versionResult.data.toRows(),
      };
    },

    /**
     * Fetch recent submissions for detailed view
     */
    async fetchRecentSubmissions(limit = 100) {
      const { executeQuery } = getState();
      const fullTable = (t: string) => `${db}.${t}`;
      
      const result = await executeQuery(`
        SELECT * FROM ${fullTable('survey_responses')} 
        WHERE completed_at IS NOT NULL
        ORDER BY completed_at DESC
        LIMIT ?
      `, [limit]);
      
      return result.data.toRows();
    },

    /**
     * Test connection health
     */
    async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
      const { executeQuery } = getState();
      const start = performance.now();
      try {
        await executeQuery('SELECT 1 as test');
        return { healthy: true, latencyMs: performance.now() - start };
      } catch {
        return { healthy: false, latencyMs: performance.now() - start };
      }
    },
  };
}
```

---

### Phase 3: Survey Form Integration (Week 2)

#### 3.1 Modify Completion Flow
```typescript
// src/components/SurveyForm.tsx - in handleSubmit/complete handler

import { useMotherDuck } from '../hooks/useMotherDuck';
import { createMotherDuckService } from '../services/motherduckService';

function SurveyForm() {
  const motherDuck = useMotherDuck();
  const mdService = createMotherDuckService(() => motherDuck);
  
  const handleComplete = async () => {
    // 1. Existing localStorage completion (always works)
    const submission = getCurrentSubmission();
    await completeSubmissionLocally(submission);
    
    // 2. Background sync to MotherDuck (non-blocking)
    if (motherDuck.isConnected) {
      // Fire-and-forget with error logging
      mdService.submitSurvey(submission)
        .then(() => console.log('✅ Synced to MotherDuck'))
        .catch(err => {
          console.warn('⚠️ MotherDuck sync failed (data safe in localStorage):', err);
          // Could queue for retry here
        });
    }
    
    // 3. Show success UI
    showCompletionScreen(submission);
  };
}
```

#### 3.2 Offline Queue (Optional Enhancement)
```typescript
// src/services/offlineQueue.ts
interface QueuedSubmission {
  submission: SurveySubmission;
  timestamp: number;
  retries: number;
}

class OfflineQueue {
  private queue: QueuedSubmission[] = [];
  private processing = false;
  private maxRetries = 3;
  
  constructor() {
    // Load from IndexedDB on init
    this.loadFromStorage();
  }
  
  add(submission: SurveySubmission) {
    this.queue.push({ submission, timestamp: Date.now(), retries: 0 });
    this.saveToStorage();
    this.process();
  }
  
  async process() {
    if (this.processing || this.queue.length === 0) return;
    if (!navigator.onLine) return;
    
    this.processing = true;
    const { executeInsert } = getMotherDuckState(); // Need access
    
    while (this.queue.length > 0) {
      const item = this.queue[0];
      try {
        await mdService.submitSurvey(item.submission);
        this.queue.shift();
      } catch (err) {
        item.retries++;
        if (item.retries >= this.maxRetries) {
          console.error('Max retries exceeded:', item.submission.submission_id);
          this.queue.shift(); // Give up
        }
        break; // Stop processing on error
      }
    }
    
    this.saveToStorage();
    this.processing = false;
  }
  
  // IndexedDB persistence...
}

export const offlineQueue = new OfflineQueue();
```

---

### Phase 4: Analytics Dashboard (Week 2-3)

#### 4.1 Data Source Switch
```typescript
// src/components/AnalyticsDashboard.tsx

import { useMotherDuck } from '../hooks/useMotherDuck';
import { createMotherDuckService } from '../services/motherduckService';
import { useState, useEffect } from 'react';

function AnalyticsDashboard() {
  const motherDuck = useMotherDuck();
  const mdService = createMotherDuckService(() => motherDuck);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!motherDuck.isConnected) return;
    
    setLoading(true);
    setError(null);
    try {
      const analytics = await mdService.fetchAnalytics();
      setData(analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
      console.error('Analytics load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (motherDuck.isConnected) {
      loadData();
      // Auto-refresh every 5 minutes
      const interval = setInterval(loadData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [motherDuck.isConnected]);

  // Show connection UI if not connected
  if (!motherDuck.isConnected) {
    return (
      <div className="analytics-dashboard">
        <MotherDuckConnect onConnect={loadData} />
      </div>
    );
  }

  // Render charts using MotherDuck data
  return (
    <div className="analytics-dashboard">
      <header className="analytics-dashboard__header">
        <h2>NENA Survey Analytics (MotherDuck)</h2>
        <button onClick={loadData} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>
      
      {error && <div className="error">{error}</div>}
      
      <KPICards data={data} />
      <Charts data={data} />
      <RecentSubmissionsTable />
    </div>
  );
}
```

#### 4.2 Connection Component
```typescript
// src/components/MotherDuckConnect.tsx

import { useMotherDuck } from '../hooks/useMotherDuck';
import { useState } from 'react';

export function MotherDuckConnect({ onConnect }: { onConnect?: () => void }) {
  const { connect, isConnected, error, isInitialized } = useMotherDuck();
  const [token, setToken] = useState('');

  if (isConnected) return null;

  const handleConnect = () => {
    connect(token).then(() => {
      onConnect?.();
    });
  };

  return (
    <div className="motherduck-connect">
      <h3>Connect to MotherDuck Analytics</h3>
      <p>Enter a scoped MotherDuck token to enable centralized analytics.</p>
      
      <div className="token-input">
        <input
          type="password"
          placeholder="Paste MotherDuck service token"
          value={token}
          onChange={e => setToken(e.target.value)}
          disabled={isInitialized}
        />
        <button 
          onClick={handleConnect} 
          disabled={!token || isInitialized}
        >
          {isInitialized ? 'Connecting...' : 'Connect'}
        </button>
      </div>
      
      {error && <div className="error">❌ {error}</div>}
      
      <details>
        <summary>How to get a token</summary>
        <ol>
          <li>Log into MotherDuck UI</li>
          <li>Go to Settings → Tokens → Create Scoped Token</li>
          <li>Select role: <code>survey_writer</code></li>
          <li>Copy token and paste above</li>
        </ol>
      </details>
    </div>
  );
}
```

---

### Phase 5: Build & Deploy (Week 3)

#### 5.1 Static Build with WASM
```bash
# Build for static deployment
npm run build:static

# Output: static/ folder with:
# static/
#   index.html
#   assets/
#     index-<hash>.js          # Main app bundle
#     index-<hash>.css
#     motherduck-wasm-<hash>.js  # WASM client chunk
#     *.wasm                    # DuckDB WASM binaries (loaded dynamically)
```

#### 5.2 Host Configuration (nginx example)
```nginx
server {
    listen 443 ssl;
    server_name census.nena.org;

    ssl_certificate     /etc/letsencrypt/live/census.nena.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/census.nena.org/privkey.pem;

    # REQUIRED for WASM SharedArrayBuffer
    add_header Cross-Origin-Embedder-Policy require-corp;
    add_header Cross-Origin-Opener-Policy same-origin;

    # MIME type for WASM
    types {
        application/wasm wasm;
    }

    root /var/www/nena-survey/static;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### 5.3 Cloudflare/Azure/CDN Headers
If using a CDN, ensure these headers are passed through:
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
Content-Type: application/wasm (for .wasm files)
```

---

## Testing Checklist

### Pre-Deployment
- [ ] MotherDuck database `nena_survey` created
- [ ] Tables `survey_responses`, `survey_answers` created
- [ ] View `survey_analytics` created
- [ ] Scoped token `nena-survey-static-2026` created with INSERT permissions
- [ ] Token added to `.env.production` as `VITE_MOTHERDUCK_TOKEN`
- [ ] `npm run build:static` completes without errors
- [ ] WASM chunk (`motherduck-wasm-*.js`) present in `static/assets/`

### Functional Testing
- [ ] Survey loads at `https://census.nena.org`
- [ ] Can start new survey
- [ ] Can answer questions (localStorage works)
- [ ] "Save & Get Code" generates resume URL
- [ ] Complete survey → data in localStorage
- [ ] MotherDuck connection establishes (check console)
- [ ] Complete survey → data appears in MotherDuck (query `survey_responses`)
- [ ] Analytics Dashboard loads data from MotherDuck
- [ ] Offline: complete survey → syncs when back online

### Security Testing
- [ ] Token not visible in built JS (only used at runtime from env)
- [ ] Token cannot SELECT from tables (only INSERT)
- [ ] Duplicate submission IDs rejected (PK constraint)
- [ ] HTTPS only (no mixed content warnings)
- [ ] COEP/COOP headers present on all responses

### Performance Testing
- [ ] Initial load < 3s (WASM loads on demand)
- [ ] MotherDuck connection < 5s
- [ ] Survey completion + sync < 2s
- [ ] Analytics dashboard load < 3s
- [ ] Bundle size increase < 1MB (WASM chunk)

---

## Rollback Plan

If issues arise post-deployment:

### Immediate (5 min)
```bash
# Remove token from build - disables MotherDuck entirely
# In .env.production:
VITE_MOTHERDUCK_TOKEN=
# Rebuild and redeploy static/
npm run build:static
```

### Graceful Degradation (Built-in)
- localStorage always works (primary storage)
- MotherDuck is additive (analytics, centralization)
- No user-facing errors if MotherDuck unavailable
- Console warnings only

### Data Recovery
- All responses in localStorage on each device
- Export from MotherDuck: `SELECT * FROM survey_responses`
- Export from localStorage: Analytics Dashboard → Download

---

## Cost Estimate

### MotherDuck Pricing (2026)
| Tier | Storage | Compute | Cost |
|------|---------|---------|------|
| Free | 10 GB | 1000 CU/hour | $0 |
| Standard | 100 GB | 10000 CU/hour | $25/mo |

### Expected Usage (2026 Survey)
- ~500 PSAPs × 1 response = 500 rows in `survey_responses`
- ~500 × 50 questions = 25,000 rows in `survey_answers`
- Storage: < 50 MB
- Compute: ~100 CU/hour (analytics queries)
- **Well within free tier**

---

## Timeline

| Week | Deliverable |
|------|-------------|
| 1 | Dependencies, hook, service, schema, token |
| 2 | SurveyForm integration, offline queue |
| 3 | Analytics Dashboard, build config, deploy |
| **Total** | **~3 weeks / ~60 hours** |

---

## Decision Points for Client Review

### 1. Token Management
- [ ] NENA creates and manages scoped token
- [ ] Token expires 2027-12-31
- [ ] Token stored in CI/CD secrets (not repo)

### 2. Data Retention
- [ ] Keep in MotherDuck indefinitely
- [ ] Export and delete after analysis
- [ ] Archive to NENA data warehouse

### 3. Analytics Access
- [ ] Dashboard at `/analytics` route (authenticated?)
- [ ] Direct MotherDuck UI access for analysts
- [ ] Automated exports to Google Sheets/Excel

### 4. Compliance
- [ ] PII handling (survey is anonymous per design)
- [ ] Data residency (MotherDuck US regions)
- [ ] Audit logging (MotherDuck provides query history)

---

## Appendix: File Changes Summary

### New Files
```
src/hooks/useMotherDuck.ts           # Connection management
src/services/motherduckService.ts    # Submit/query logic
src/services/offlineQueue.ts         # Optional offline sync
src/components/MotherDuckConnect.tsx # Connection UI
```

### Modified Files
```
src/components/SurveyForm.tsx        # Add MotherDuck sync on complete
src/components/AnalyticsDashboard.tsx # Switch to MotherDuck data source
vite.config.ts                       # WASM chunk, headers
.env.production                      # VITE_MOTHERDUCK_TOKEN
package.json                         # @motherduck/wasm-client dependency
```

### MotherDuck SQL (Run Once)
```
CREATE DATABASE nena_survey;
CREATE TABLE survey_responses (...);
CREATE TABLE survey_answers (...);
CREATE VIEW survey_analytics AS ...;
CREATE ROLE survey_writer;
GRANT INSERT ON ... TO survey_writer;
CREATE SCOPED TOKEN 'nena-survey-static-2026' FOR ROLE survey_writer;
```

---

## Next Steps

1. **Client Review** → Approve approach and security model
2. **MotherDuck Setup** → Create database, tables, scoped token
3. **Environment Config** → Add token to CI/CD secrets
4. **Development** → Implement phases 1-5
5. **Staging Deploy** → Test at staging.census.nena.org
6. **Production Deploy** → Switch DNS to new build

---

*Document Version: 1.0*  
*Author: [Your Name]*  
*Date: 2026-11-25*  
*Status: For Client Review*