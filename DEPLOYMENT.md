# NENA Survey — Deployment Guide

## Overview

This application supports two deployment modes:

| Mode | Host Requirements | Data Storage | Best For |
|------|-------------------|--------------|----------|
| **Static** | Any web server (nginx, Apache, S3, Netlify, etc.) | Browser localStorage | Simple deployments, no server needed |
| **Full Stack** | Node.js 18+ runtime | Local DuckDB + MotherDuck | Production with analytics, data persistence |

---

## Mode 1: Static Deployment (No Backend)

Everything runs in the browser. Survey data is stored in `localStorage` per device/browser. No API server required.

### Build

```bash
npm install
npm run build:static
```

This creates the `static/` folder with:
```
static/
  index.html
  favicon.ico
  assets/
    index-<hash>.js
    index-<hash>.css
```

### Deploy

Upload the contents of `static/` to any web host:

| Host | Method |
|------|--------|
| **nginx / Apache** | Copy `static/*` to document root |
| **AWS S3** | `aws s3 sync static/ s3://your-bucket/ --delete` |
| **Netlify / Vercel** | Set build command to `npm run build:static`, publish directory to `static` |
| **GitHub Pages** | Push `static/` contents to `gh-pages` branch |
| **Azure Static Web Apps** | Upload `static/` folder |

### Limitations

- Data is browser/device scoped (not shared across respondents)
- No centralized database across users
- Resume codes work within the same browser
- Analytics are computed locally from stored responses

### Verify

Open the deployed URL. You should see the NENA Survey landing page.

---

## Mode 2: Full Stack Deployment (Node.js Backend)

Requires a server running Node.js. The backend handles survey persistence, resume tokens, and MotherDuck analytics sync.

### Prerequisites

- Node.js 18+ (20+ recommended)
- npm
- MotherDuck account (for cloud analytics)
- A process manager (pm2, systemd, or Docker)

### Build

```bash
npm install
npm run type-check
npm run lint              # optional but recommended
npm run build             # builds frontend → dist/
npm run build:server      # compiles server → server/dist/
```

### Deployment Artifacts

```
dist/                     # Frontend (Vite build output)
server/dist/              # Compiled server (TypeScript → JavaScript)
server/duckdb.ts          # Local DuckDB adapter (source)
server/analytics.ts       # MotherDuck ELT pipeline (source)
server/survey_responses.db   # Local DuckDB (auto-created on first run)
server/survey_analytics.duckdb # Analytics DuckDB (auto-created on first run)
```

### Environment Variables

Set these on your hosting platform:

```bash
# Required
PORT=3001
MOTHERDUCK_DB=your_database_name
MOTHERDUCK_TOKEN=your_token_here

# Recommended
API_BASE=/survey                           # URL prefix if behind reverse proxy
CORS_ALLOWED_ORIGINS=https://your-domain.com
ANALYTICS_REQUIRE_MOTHERDUCK=true

# Optional
API_BODY_LIMIT=64kb
API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX=300
INCOMPLETE_PURGE_DAYS=7
COMPLETED_ARCHIVE_DAYS=365
```

### Start

```bash
npm run server:prod
```

Or with pm2:

```bash
pm2 start server/dist/server.js --name nena-survey
pm2 save
pm2 startup
```

### Verify

```powershell
# Health check
Invoke-RestMethod -Uri "https://your-domain.com/survey/api/analytics/health"
```

Expected response:
```json
{
  "targetCatalog": "md",
  "motherduckConnected": true,
  "motherduckLastError": null
}
```

---

## Reverse Proxy Setup (nginx)

If serving both frontend and API behind nginx:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    # SSL config (use certbot or your preferred method)
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Frontend static files
    location /survey/ {
        alias /var/www/nena-survey/static/;
        try_files $uri $uri/ /survey/index.html;
    }

    # API proxy
    location /survey/api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Docker Deployment (Optional)

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled server
COPY server/dist/ ./server/dist/
COPY server/types.ts ./server/
COPY server/duckdb.ts ./server/
COPY server/analytics.ts ./server/
COPY server/database.ts ./server/
COPY server/db.ts ./server/
COPY server/answerValidator.ts ./server/
COPY server/email.ts ./server/

# Copy frontend build
COPY dist/ ./dist/

# Create data directory
RUN mkdir -p /app/data

ENV DUCKDB_PATH=/app/data/survey_responses.db
ENV DUCKDB_ANALYTICS_PATH=/app/data/survey_analytics.duckdb
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/dist/server.js"]
```

### Build & Run

```bash
# Build frontend
npm run build
npm run build:server

# Build Docker image
docker build -t nena-survey .

# Run
docker run -d \
  -p 3001:3001 \
  -e MOTHERDUCK_DB=your_database \
  -e MOTHERDUCK_TOKEN=your_token \
  -e ANALYTICS_REQUIRE_MOTHERDUCK=true \
  -v nena-data:/app/data \
  --name nena-survey \
  nena-survey
```

---

## Post-Deployment Checklist

### Static Mode
- [ ] `static/` folder uploaded to host
- [ ] Survey loads at deployed URL
- [ ] Can start a new survey
- [ ] Can save and resume (same browser)

### Full Stack Mode
- [ ] `npm install` completed
- [ ] `npm run build` completed → `dist/` exists
- [ ] `npm run build:server` completed → `server/dist/` exists
- [ ] Environment variables configured
- [ ] `npm run server:prod` starts successfully
- [ ] Health endpoint returns `motherduckConnected: true`
- [ ] Test survey submission completes successfully
- [ ] Analytics refresh shows new submission in MotherDuck

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `MotherDuck attach failed` | Verify `MOTHERDUCK_DB` and `MOTHERDUCK_TOKEN` are correct |
| `CORS error` in browser | Add your domain to `CORS_ALLOWED_ORIGINS` |
| `404 on /survey/api/` | Ensure `API_BASE=/survey` is set on the server |
| Static mode: data not persisting | Check browser localStorage isn't disabled |
| `Cannot find module` on server start | Run `npm run build:server` again |
