import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import {
  getQueue, getQueueStats, getJobs, createJob, getThroughput
} from '../api/client'

const STATUS_COLORS = {
  scheduled: 'text-blue-400 bg-blue-900/40',
  queued: 'text-gray-300 bg-gray-700/60',
  claimed: 'text-purple-400 bg-purple-900/40',
  running: 'text-yellow-400 bg-yellow-900/40',
  completed: 'text-green-400 bg-green-900/40',
  failed: 'text-red-400 bg-red-900/40',
  dead_letter: 'text-orange-400 bg-orange-900/40',
}

const JOB_TYPES = ['immediate', 'delayed', 'scheduled', 'recurring', 'batch']

const defaultForm = {
  type: 'immediate',
  payload: '{}',
  delaySeconds: 60,
  runAt: '',
  cronExpression: '',
  batchCount: 3,
}

export default function QueueDetailPage() {
  const { queueId } = useParams()
  const [queue, setQueue] = useState(null)
  const [stats, setStats] = useState(null)
  const [jobs, setJobs] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 })
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [throughput, setThroughput] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [submitting, setSubmitting] = useState(false)

  async function load(page = 1) {
    try {
      const [qRes, sRes, jRes, tRes] = await Promise.all([
        getQueue(queueId),
        getQueueStats(queueId),
        getJobs({ queueId, page, limit: 10, status: filterStatus || undefined, type: filterType || undefined }),
        getThroughput({ queueId, buckets: 10, bucketMinutes: 5 }),
      ])
      setQueue(qRes.data.queue)
      setStats(sRes.data.stats)
      setJobs(jRes.data.jobs)
      setPagination(jRes.data.pagination)
      setThroughput(tRes.data.throughput.map((b) => ({
        time: new Date(b.label).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        jobs: b.count,
      })))
    } catch {
      setError('Failed to load queue data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [queueId, filterStatus, filterType])

  async function handleCreateJob(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      let payload
      try { payload = JSON.parse(form.payload || '{}') } catch { return setError('Payload must be valid JSON') }

      const body = { queueId, type: form.type, payload }
      if (form.type === 'delayed') body.delaySeconds = Number(form.delaySeconds)
      if (form.type === 'scheduled') body.runAt = form.runAt
      if (form.type === 'recurring') body.cronExpression = form.cronExpression
      if (form.type === 'batch') {
        body.jobs = Array.from({ length: Number(form.batchCount) }, (_, i) => ({
          payload: { ...payload, batchIndex: i },
        }))
      }

      await createJob(body)
      setShowForm(false)
      setForm(defaultForm)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create job')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="text-gray-400 p-8 text-center">Loading...</div>
  if (!queue) return <div className="text-red-400 p-8 text-center">{error || 'Queue not found'}</div>

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4">
        <Link to="/projects" className="hover:text-gray-300 transition-colors">Projects</Link>
        <span className="mx-2">›</span>
        <Link to={`/projects/${queue.projectId}`} className="hover:text-gray-300 transition-colors">Project</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-200">{queue.name}</span>
      </nav>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{queue.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${queue.isPaused ? 'bg-yellow-900/60 text-yellow-400' : 'bg-green-900/60 text-green-400'}`}>
              {queue.isPaused ? '⏸ Paused' : '▶ Active'}
            </span>
          </div>
          <p className="text-gray-400 text-sm mt-1">
            Priority {queue.priority} · {queue.retryPolicyType} retry · {queue.concurrency} concurrent
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Job'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-6 sm:grid-cols-7">
          {Object.entries(STATUS_COLORS).map(([status, cls]) => (
            <div key={status} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
              <div className={`text-lg font-bold ${cls.split(' ')[0]}`}>{stats[status] ?? 0}</div>
              <div className="text-xs text-gray-500 mt-0.5 capitalize">{status.replace('_', ' ')}</div>
            </div>
          ))}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-white">{stats.total ?? 0}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total</div>
          </div>
        </div>
      )}

      {/* Throughput Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-300 mb-4">Completed Jobs (last 50 min, 5-min buckets)</h2>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={throughput}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#e5e7eb' }}
            />
            <Bar dataKey="jobs" fill="#6366f1" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Create Job Form */}
      {showForm && (
        <form onSubmit={handleCreateJob} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-white mb-4">New Job</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Job Type</label>
              <select
                id="job-type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {form.type === 'delayed' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Delay (seconds)</label>
                <input
                  id="job-delay"
                  type="number"
                  min="0"
                  value={form.delaySeconds}
                  onChange={(e) => setForm({ ...form, delaySeconds: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            )}

            {form.type === 'scheduled' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Run At (datetime)</label>
                <input
                  id="job-run-at"
                  type="datetime-local"
                  value={form.runAt}
                  onChange={(e) => setForm({ ...form, runAt: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            )}

            {form.type === 'recurring' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Cron Expression</label>
                <input
                  id="job-cron"
                  type="text"
                  value={form.cronExpression}
                  onChange={(e) => setForm({ ...form, cronExpression: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="e.g. */5 * * * *"
                />
              </div>
            )}

            {form.type === 'batch' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Number of jobs in batch</label>
                <input
                  id="job-batch-count"
                  type="number"
                  min="1"
                  max="100"
                  value={form.batchCount}
                  onChange={(e) => setForm({ ...form, batchCount: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-sm text-gray-400 mb-1">Payload (JSON)</label>
              <textarea
                id="job-payload"
                rows={3}
                value={form.payload}
                onChange={(e) => setForm({ ...form, payload: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder='{"key": "value"}'
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Job'}
          </button>
        </form>
      )}

      {/* Jobs List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">Jobs</h2>
          <div className="flex gap-2">
            <select
              id="filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All statuses</option>
              {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              id="filter-type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All types</option>
              {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={() => load(pagination.page)}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No jobs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Retry</th>
                  <th className="px-4 py-2">Run At</th>
                  <th className="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2">
                      <Link to={`/jobs/${job.id}`} className="text-indigo-400 hover:text-indigo-300 font-mono text-xs">
                        {job.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-300">{job.type}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status] || 'text-gray-400 bg-gray-800'}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-400">{job.retryCount}/{job.maxRetries}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{new Date(job.runAt).toLocaleString()}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{new Date(job.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <span className="text-xs text-gray-500">
              {pagination.total} total · Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => load(pagination.page - 1)}
                className="text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                ← Prev
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => load(pagination.page + 1)}
                className="text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
