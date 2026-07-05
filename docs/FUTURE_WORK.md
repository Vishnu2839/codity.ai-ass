# Future Work

Features not implemented in this version, with notes on how they would be built.

---

## 1. WebSocket Live Dashboard Updates

**Current state**: The dashboard requires a manual Refresh button to see new job statuses.

**How to implement**: Add `socket.io` to the Express server. When the Worker updates a job's status, it could either:
- Emit directly via a shared Redis pub/sub channel that the API subscribes to, or
- The API polls the DB for changes and pushes them to connected clients

The frontend would subscribe to `job:status_changed` events and update the relevant job row in real time. `socket.io-client` on the React side handles reconnection automatically.

**Complexity**: Medium. The main challenge is sharing event emission between the Worker process and the API process (they're separate Node processes). A Redis pub/sub channel is the standard solution.

---

## 2. Role-Based Access Control (RBAC)

**Current state**: All users are equal — they can only see their own resources.

**How to implement**: Add a `role` field to the `User` model (`"user" | "admin" | "viewer"`). Admins would be able to see all projects and queues. Viewers would be read-only. Middleware would check `req.user.role` before allowing write operations. Project-level roles (e.g., project members) would require a `ProjectMember` join table.

**Complexity**: Low-medium for basic admin/user split; high for per-project ACLs.

---

## 3. Distributed Locking for Multiple Worker Instances

**Current state**: Running two worker instances against the same DB would cause race conditions on job claiming.

**How to implement**: Two approaches:
1. **Optimistic locking** (current partial implementation): The `WHERE status='queued'` in the UPDATE statement prevents double-claiming at the DB level. Works for multiple workers on PostgreSQL with proper transaction isolation. On SQLite, file-level locking limits true parallelism.
2. **Pessimistic locking with leader election**: One worker instance is elected "leader" (using a DB row with a heartbeat timestamp). Only the leader polls. If the leader misses a heartbeat, another instance takes over.
3. **Redis SETNX / Redlock**: For a Redis-based setup, `Redlock` implements the distributed locking algorithm across multiple Redis instances.

**Complexity**: Medium. For PostgreSQL + multiple workers, `SELECT ... FOR UPDATE SKIP LOCKED` is the production-grade solution — it atomically claims a batch of jobs without application-level locking.

---

## 4. Queue Sharding

**Current state**: All queues and jobs live in one database.

**How to implement**: Partition queues across multiple database shards based on a shard key (e.g., `projectId % numShards`). Each worker instance is assigned to one or more shards. A shard registry (stored in a central DB or config) maps queue IDs to shard locations. This allows horizontal scaling of storage and processing.

**Complexity**: High. Requires cross-shard queries for admin views and careful shard rebalancing logic.

---

## 5. Rate Limiting

**Current state**: No rate limiting on API endpoints.

**How to implement**: Use `express-rate-limit` with a Redis or in-memory store. Apply per-user limits (extracted from JWT `userId`) using a custom key generator. Rate limit configuration would be environment-variable-driven (e.g., `RATE_LIMIT_WINDOW_MS=60000`, `RATE_LIMIT_MAX=100`).

**Complexity**: Low. Two npm packages (`express-rate-limit`, `rate-limit-redis`) and a few lines of middleware.

---

## 6. Workflow Dependencies Between Jobs

**Current state**: Jobs are independent. No job can wait for another job to complete.

**How to implement**: Add a `dependsOnJobId` FK to the `Job` table. The Worker's eligibility check adds `AND (dependsOnJobId IS NULL OR dependsOn.status = 'completed')` to the query. This enables simple linear DAGs. For complex DAGs (fan-out/fan-in), a `JobDependency` join table would allow many-to-many dependencies, and the check would be `WHERE NOT EXISTS (SELECT 1 FROM JobDependency WHERE ...status != 'completed')`.

**Complexity**: Medium for linear chains; high for arbitrary DAGs (topological sort, cycle detection).

---

## 7. AI-Generated Failure Summaries

**Current state**: Failed jobs show raw error messages from the executor.

**How to implement**: When a job moves to `dead_letter`, call an LLM API (e.g., OpenAI GPT-4o or a local Ollama model) with the job's payload, the execution log, and the error messages. The model generates a human-readable summary: "This job failed because the external payment API returned a rate limit error 3 times. Consider increasing the retry base delay or adding exponential backoff." Store the summary in a `failureSummary` column on the Job table and display it in the dashboard.

**For local/free**: Use `ollama` with `llama3.2` running locally — no API key, no cost. The summary generation is async and non-blocking.

**Complexity**: Low-medium. The main challenge is prompt engineering to produce useful summaries across different job types and error patterns.

---

## 8. Dead Letter Queue Re-processing

**Current state**: Dead letter jobs can be manually retried one by one.

**How to implement**: Add a bulk retry endpoint `POST /api/queues/:id/retry-dead-letters` that resets all `dead_letter` jobs in a queue back to `queued` in a single transaction. Optionally add an `alertAfterDeadLetterCount` threshold on the Queue model that triggers a webhook or email notification when too many jobs go dead letter.

**Complexity**: Low.
