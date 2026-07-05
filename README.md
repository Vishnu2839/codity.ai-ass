# Distributed Job Scheduler

A simplified version of the background job processing systems used by YouTube (video processing), Gmail (email delivery), and Uber (receipt generation). Built as a monorepo with a separate API server, worker process, and React dashboard.

## What It Does

- Users register and log in (JWT auth)
- Create **Projects** to organize work
- Create **Queues** per project (with priority, concurrency limits, retry policies, pause/resume)
- Submit **Jobs** of 5 types: immediate, delayed, scheduled, recurring (cron), or batch
- A separate **Worker** process polls the database and executes jobs with configurable retry logic
- A **Dashboard** shows live job status, execution logs, and throughput charts

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Node.js 18+ + Express |
| Database | SQLite (via Prisma ORM) — zero setup, just a local file |
| Auth | JWT + bcrypt |
| Worker | Plain Node.js polling loop — no Redis, no external queue |
| Frontend | React + Vite + Tailwind CSS |
| Testing | Jest + Supertest |
| Charts | Recharts |

## Folder Structure

```
distributed-job-scheduler/
├── backend/        # Express REST API (port 3001)
├── worker/         # Standalone job processor (polls SQLite)
├── frontend/       # React dashboard (port 5173)
├── docs/           # Architecture, ER diagram, API docs, etc.
└── README.md       # This file
```

## Prerequisites

- **Node.js 18+** (check with `node --version`)
- **npm 9+** (check with `npm --version`)
- No other software needed — SQLite is embedded

## Quick Start (3 terminals)

### Terminal 1 — Backend API

```bash
cd backend
npm install
cp .env.example .env
npx prisma migrate dev --name init
npx prisma generate
npm run dev
```

Backend runs at **http://localhost:3001**

### Terminal 2 — Worker

```bash
cd worker
npm install
cp .env.example .env
npm run worker
```

Worker polls the database every 2 seconds and processes queued jobs.

### Terminal 3 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**

## Running Tests

```bash
cd backend
npm test
```

This runs all Jest + Supertest tests covering: auth, project isolation, job creation (all 5 types), and retry policy unit tests.

## Demo Flow (grader walkthrough)

1. Open **http://localhost:5173**
2. Click **Register** → create an account
3. Log in → you'll be taken to the Projects list
4. **Create a Project** (e.g., "Email Service")
5. Open the project → **Create a Queue** (e.g., name="email-queue", priority=1, retryPolicy=exponential, maxRetries=3, concurrency=2)
6. Open the queue → **Create a Job** (choose "immediate" type)
7. Watch the **Worker terminal** — within 2 seconds it picks up the job, simulates execution, and marks it complete/failed
8. Refresh the queue page — job status updates; if failed, click **Retry Now**
9. Create a **recurring** job with a cron expression (e.g., `*/1 * * * *`) — the worker creates a new job occurrence after each run
10. After enough retries, failed jobs move to **dead_letter** status

## Environment Variables

See `backend/.env.example` and `worker/.env.example` — all defaults work out of the box for local development.

## Documentation

| File | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture + Mermaid diagram |
| [docs/ER_DIAGRAM.md](docs/ER_DIAGRAM.md) | Database schema + ER diagram |
| [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) | All endpoints with request/response examples |
| [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) | Why SQLite, why polling, tradeoffs |
| [docs/FUTURE_WORK.md](docs/FUTURE_WORK.md) | Planned enhancements |
