# API Documentation

All endpoints except `/api/auth/register` and `/api/auth/login` require:
```
Authorization: Bearer <jwt_token>
```

Base URL: `http://localhost:3001`

---

## Authentication

### POST /api/auth/register

Register a new user account.

**Request Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "mypassword123"
}
```

**Response 201:**
```json
{
  "user": { "id": "uuid", "name": "Jane Smith", "email": "jane@example.com", "createdAt": "2024-01-01T00:00:00Z" },
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Errors:** `400` (missing fields, password < 6 chars) · `409` (email already registered)

---

### POST /api/auth/login

Log in and get a JWT token.

**Request Body:**
```json
{ "email": "jane@example.com", "password": "mypassword123" }
```

**Response 200:**
```json
{
  "user": { "id": "uuid", "name": "Jane Smith", "email": "jane@example.com" },
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Errors:** `400` (missing fields) · `401` (invalid credentials)

---

### GET /api/auth/me

Get the currently authenticated user.

**Response 200:**
```json
{ "user": { "id": "uuid", "name": "Jane Smith", "email": "jane@example.com", "createdAt": "..." } }
```

---

## Projects

### POST /api/projects

Create a new project.

**Request Body:**
```json
{ "name": "Email Service", "description": "Handles all outbound email" }
```

**Response 201:**
```json
{ "project": { "id": "uuid", "name": "Email Service", "description": "...", "userId": "uuid", "createdAt": "..." } }
```

**Errors:** `400` (name required) · `401` (no/invalid token)

---

### GET /api/projects

List all projects owned by the authenticated user.

**Response 200:**
```json
{
  "projects": [
    { "id": "uuid", "name": "Email Service", "description": "...", "_count": { "queues": 3 }, "createdAt": "..." }
  ]
}
```

---

### GET /api/projects/:id

Get a single project with its queues.

**Response 200:**
```json
{
  "project": {
    "id": "uuid", "name": "Email Service",
    "queues": [{ "id": "uuid", "name": "outbound", "isPaused": false, "priority": 1 }]
  }
}
```

**Errors:** `404` (not found or not owned by user)

---

### PATCH /api/projects/:id

Update project name or description.

**Request Body:** `{ "name": "New Name", "description": "Updated" }`

**Response 200:** `{ "project": { ... } }`

---

### DELETE /api/projects/:id

Delete a project. Cascade-deletes all queues and jobs.

**Response 200:** `{ "message": "Project deleted" }`

---

## Queues

### POST /api/queues

Create a new queue inside a project.

**Request Body:**
```json
{
  "projectId": "uuid",
  "name": "email-outbound",
  "priority": 5,
  "retryPolicyType": "exponential",
  "retryBaseDelaySeconds": 30,
  "maxRetries": 3,
  "concurrency": 2
}
```

**`retryPolicyType` values:** `fixed` · `linear` · `exponential`

**Response 201:** `{ "queue": { "id": "uuid", ... } }`

---

### GET /api/queues?projectId=:id

List all queues for a project.

**Response 200:**
```json
{ "queues": [{ "id": "uuid", "name": "...", "isPaused": false, "_count": { "jobs": 42 } }] }
```

---

### GET /api/queues/:id

Get a single queue.

---

### PATCH /api/queues/:id

Update queue settings. Use to **pause** or **resume** a queue.

**Request Body (pause):** `{ "isPaused": true }`
**Request Body (resume):** `{ "isPaused": false }`

Any subset of fields can be updated: `name`, `priority`, `retryPolicyType`, `retryBaseDelaySeconds`, `maxRetries`, `concurrency`, `isPaused`.

**Effect of `isPaused: true`:** Worker's polling query filters out paused queues, so no new jobs from this queue will be started. In-flight jobs (already `running`) complete normally.

---

### DELETE /api/queues/:id

Delete a queue. Cascade-deletes all its jobs and their execution logs.

---

### GET /api/queues/:id/stats

Get job counts grouped by status for a queue.

**Response 200:**
```json
{
  "stats": {
    "scheduled": 0, "queued": 5, "claimed": 0, "running": 2,
    "completed": 100, "failed": 3, "dead_letter": 1, "total": 111
  }
}
```

---

## Jobs

### POST /api/jobs

Create a job. Behavior varies by `type`.

**Common fields:**
```json
{ "queueId": "uuid", "type": "immediate", "payload": { "userId": 123 } }
```

**Type-specific fields:**

| Type | Extra Fields | `status` | `runAt` |
|---|---|---|---|
| `immediate` | none | `queued` | now |
| `delayed` | `delaySeconds: 60` | `scheduled` | now + 60s |
| `scheduled` | `runAt: "2024-12-25T00:00:00Z"` | `scheduled` | provided |
| `recurring` | `cronExpression: "*/5 * * * *"` | `queued` | next cron tick |
| `batch` | `jobs: [{payload:{}}, ...]` | `queued` | now |

**Response 201 (single job):** `{ "job": { "id": "uuid", "status": "queued", "runAt": "...", ... } }`

**Response 201 (batch):** `{ "batchId": "uuid", "jobs": [...], "count": 5 }`

**Errors:** `400` (missing cronExpression for recurring, missing runAt for scheduled, invalid JSON, invalid cron) · `404` (queue not found or not owned)

---

### GET /api/jobs

List jobs with pagination and filtering. Only returns jobs from queues the user owns.

**Query Parameters:**
- `queueId` — filter by queue
- `status` — filter by status (`queued`, `running`, `completed`, `failed`, `dead_letter`, `scheduled`, `claimed`)
- `type` — filter by job type
- `page` — page number (default: 1)
- `limit` — results per page (default: 20, max: 100)

**Response 200:**
```json
{
  "jobs": [{ "id": "uuid", "type": "immediate", "status": "completed", "queue": { "name": "email-outbound" } }],
  "pagination": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 }
}
```

---

### GET /api/jobs/:id

Get a single job with its queue info and execution logs.

---

### GET /api/jobs/:id/logs

Get the execution log for a specific job.

**Response 200:**
```json
{
  "logs": [
    { "id": "uuid", "fromStatus": "queued", "toStatus": "claimed", "message": "Worker claimed the job", "createdAt": "..." },
    { "id": "uuid", "fromStatus": "claimed", "toStatus": "running", "message": "Worker started execution", "createdAt": "..." },
    { "id": "uuid", "fromStatus": "running", "toStatus": "failed", "message": "Job failed: Connection timeout", "createdAt": "..." }
  ]
}
```

---

### PATCH /api/jobs/:id/retry

Manually re-queue a `failed` or `dead_letter` job. Sets `status=queued`, `runAt=now`. Does not reset `retryCount`.

**Response 200:** `{ "job": { "status": "queued", ... } }`

**Errors:** `400` (job is not in failed/dead_letter status) · `404` (not found)

---

### GET /api/jobs/throughput

Get completed job counts grouped into time buckets (for charts).

**Query Parameters:**
- `queueId` — optional, scope to a specific queue
- `buckets` — number of time buckets (default: 12)
- `bucketMinutes` — minutes per bucket (default: 5)

**Response 200:**
```json
{
  "throughput": [
    { "label": "2024-01-01T10:00:00Z", "count": 0 },
    { "label": "2024-01-01T10:05:00Z", "count": 7 }
  ]
}
```

---

## Workers

### POST /api/workers/register

Register a new worker instance. Does NOT require authentication (for simplified internal use).

**Request Body:**
```json
{
  "hostname": "worker-pool-1a"
}
```

**Response 200:**
```json
{
  "worker": { "id": "uuid", "hostname": "worker-pool-1a", "status": "active" }
}
```

---

### POST /api/workers/:id/heartbeat

Send a heartbeat to mark a worker as still active. Does NOT require authentication.

**Response 200:**
```json
{ "success": true }
```

---

## Error Response Format

All error responses use this format:
```json
{ "error": "Human-readable error message" }
```

## HTTP Status Codes Used

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (missing/invalid JWT) |
| 404 | Not found (or not owned by current user) |
| 409 | Conflict (e.g., duplicate email) |
| 500 | Internal server error |
