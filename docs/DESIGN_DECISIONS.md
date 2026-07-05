# Design Decisions

## 1. Why SQLite Instead of PostgreSQL or MySQL

**Decision:** Use SQLite via Prisma ORM.

**Rationale:**
- **Zero infrastructure**: SQLite is a single `.db` file embedded in the application process. No database server to install, no service to start, no port to configure.
- **Zero cost**: No cloud database subscription. No signup. Works completely offline.
- **Perfect for local grading**: A grader can clone the repo and run `npx prisma migrate dev` — that's it. Compare to PostgreSQL where you'd need `CREATE DATABASE`, configure credentials, potentially install the server.
- **Prisma ORM abstracts the dialect**: The Prisma schema syntax is identical for SQLite and PostgreSQL. Migrating to Postgres for production is a one-line change in `schema.prisma` (`provider = "postgresql"`).

**Tradeoffs:**
- SQLite uses file-level locking, so it's not suitable for high-concurrency write workloads. For a real production system with thousands of jobs/second, PostgreSQL with connection pooling (e.g., PgBouncer) would be needed.
- SQLite does not support the `RETURNING` clause in some older versions (Prisma handles this).
- Running multiple worker instances against the same SQLite file could cause lock contention. In practice, a single-worker-per-file setup is the common pattern.

---

## 2. Why a Custom Polling Worker Instead of BullMQ or Redis

**Decision:** A plain Node.js `setInterval` loop that queries SQLite directly.

**Rationale:**
- **No external services**: BullMQ requires Redis. Redis requires a running server process. For local dev grading, this is friction.
- **The DB is already the source of truth**: Since we store jobs in SQLite anyway, the simplest correct approach is to query that same DB. No synchronization needed between the queue and the DB.
- **Full observability**: Every job state is visible in the database at all times. With Redis-backed queues, job state lives in Redis memory and you need additional tooling (Bull Board, etc.) to inspect it.
- **Correctness under crashes**: If the worker crashes mid-job, the job stays in `claimed` or `running` status. A recovery script (or human) can reset it. With Redis, an in-memory queue can lose jobs on crash without persistence configured.

**Tradeoffs:**
- **Latency floor = poll interval (2s)**: A job submitted to the API will sit in the DB for up to 2 seconds before the worker notices it. BullMQ with Redis pub/sub can achieve <10ms dispatch latency.
- **Not horizontally scalable as written**: Multiple workers polling the same SQLite file would have race conditions without proper distributed locking (handled here by the `WHERE status='queued'` atomic update, but SQLite file locking limits true parallelism).
- **Polling load**: Every 2 seconds the worker issues a SELECT query even when there are no jobs. At scale, this is wasteful. A production system would use `LISTEN/NOTIFY` (PostgreSQL) or pub/sub (Redis) to only wake the worker when there's actual work.

**In production**, we would use PostgreSQL + BullMQ (or a managed queue service like AWS SQS) for push-based dispatch, but keep the same state-machine-in-DB pattern for auditability.

---

## 3. Why JWT for Authentication

**Decision:** Stateless JWT tokens, signed with HS256.

**Rationale:**
- **Stateless**: The API server does not need a session store. Any instance can verify any token by checking the signature with the shared secret.
- **Standard**: JWTs are the standard for REST API auth and well-understood by all frameworks.
- **Simple for local dev**: No Redis session store, no cookie complexity for cross-origin requests.

**Tradeoffs:**
- JWTs cannot be revoked before expiry without a denylist (which would require a session store). For this project, 7-day token expiry is acceptable.
- Token payload is base64-encoded (not encrypted) — don't put sensitive data in the payload.

---

## 4. How Concurrency Is Enforced

The worker maintains an in-memory `runningCounts` map (`{ queueId → count }`). Before claiming a job, it checks `getRunning(queueId) < queue.concurrency`. If the queue is at capacity, the job is skipped in this poll cycle.

**Limitation**: This in-memory count is reset when the worker restarts. If the worker crashes with jobs in `running` state, those counts are lost. When the worker restarts, it may briefly run more jobs than the concurrency limit. For a single-worker setup, this is acceptable — the jobs will eventually complete.

**Production fix**: Use a `claimedAt` timestamp on the Job table. Treat jobs that have been `claimed` for more than N seconds as failed (heartbeat timeout). Count DB rows with `status='running'` for authoritative concurrency rather than in-memory counters.

---

## 5. How Queue Pausing Works

Setting `isPaused = true` on a Queue is checked in the Worker's SQL query:

```sql
WHERE status = 'queued' AND runAt <= now AND queue.isPaused = false
```

The worker will not pick up any new jobs from a paused queue. Jobs currently `running` are allowed to complete — we don't interrupt in-flight work. This is the expected behavior (similar to how BullMQ implements `queue.pause()`).

**API enforcement**: The `isPaused` flag only affects the Worker, not the API. Users can still create new jobs in a paused queue; they just won't be picked up until the queue is resumed.

---

## 6. Retry Policy Implementation

Three policies implemented as pure functions in `worker/src/retryPolicies.js`:

| Policy | Formula | Example (base=10s) |
|---|---|---|
| `fixed` | `base` | 10s, 10s, 10s |
| `linear` | `base × retryCount` | 10s, 20s, 30s |
| `exponential` | `base × 2^(retryCount-1)` | 10s, 20s, 40s |

When a job fails and `retryCount < maxRetries`, the worker:
1. Increments `retryCount`
2. Computes `nextRunAt = now + delaySeconds`
3. Sets `status = 'scheduled'`
4. The scheduler promotion step converts it back to `queued` when `nextRunAt` is reached

---

## 7. Simplifications Made

- **Simulated execution**: The job executor does a random sleep (500–2000ms) and fails 20% of the time. In production, `executors/` would contain real integrations (SMTP, S3, video API, etc.).
- **No distributed locking**: A single worker instance is assumed. See `FUTURE_WORK.md` for the multi-worker locking strategy.
- **No WebSocket live updates**: The dashboard requires manual refresh or periodic polling from the frontend. See `FUTURE_WORK.md`.
- **No rate limiting on the API**: A production system would use `express-rate-limit` per user.
- **JSON payload stored as text**: SQLite does not have a native JSON column type. Prisma stores it as a TEXT column; the application serializes/deserializes with `JSON.stringify/parse`.
