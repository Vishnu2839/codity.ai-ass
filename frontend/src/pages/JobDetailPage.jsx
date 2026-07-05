import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getJob, getJobLogs, retryJob } from '../api/client'

const STATUS_COLORS = {
  scheduled: 'text-blue-400 bg-blue-900/40 border-blue-800',
  queued: 'text-gray-300 bg-gray-700/60 border-gray-600',
  claimed: 'text-purple-400 bg-purple-900/40 border-purple-800',
  running: 'text-yellow-400 bg-yellow-900/40 border-yellow-800',
  completed: 'text-green-400 bg-green-900/40 border-green-800',
  failed: 'text-red-400 bg-red-900/40 border-red-800',
  dead_letter: 'text-orange-400 bg-orange-900/40 border-orange-800',
}

export default function JobDetailPage() {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)

  async function load() {
    try {
      const [jobRes, logRes] = await Promise.all([
        getJob(jobId),
        getJobLogs(jobId),
      ])
      setJob(jobRes.data.job)
      setLogs(logRes.data.logs)
    } catch {
      setError('Failed to load job')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [jobId])

  async function handleRetry() {
    setRetrying(true)
    try {
      await retryJob(jobId)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to retry job')
    } finally {
      setRetrying(false)
    }
  }

  if (loading) return <div className="text-gray-400 p-8 text-center">Loading...</div>
  if (!job) return <div className="text-red-400 p-8 text-center">{error || 'Job not found'}</div>

  const statusCls = STATUS_COLORS[job.status] || 'text-gray-400 bg-gray-800 border-gray-700'
  const canRetry = job.status === 'failed' || job.status === 'dead_letter'

  let payloadObj = {}
  try { payloadObj = JSON.parse(job.payload || '{}') } catch {}

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4">
        <Link to="/projects" className="hover:text-gray-300 transition-colors">Projects</Link>
        <span className="mx-2">›</span>
        <Link to={`/queues/${job.queueId}`} className="hover:text-gray-300 transition-colors">Queue</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-200 font-mono">{job.id.slice(0, 8)}…</span>
      </nav>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Job details */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h1 className="font-bold text-white text-lg">Job Details</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${statusCls}`}>
                {job.status}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">ID</span>
                <p className="text-gray-200 font-mono text-xs mt-0.5 break-all">{job.id}</p>
              </div>
              <div>
                <span className="text-gray-500">Type</span>
                <p className="text-gray-200 mt-0.5 capitalize">{job.type}</p>
              </div>
              <div>
                <span className="text-gray-500">Retry Count</span>
                <p className="text-gray-200 mt-0.5">{job.retryCount} / {job.maxRetries}</p>
              </div>
              <div>
                <span className="text-gray-500">Run At</span>
                <p className="text-gray-200 mt-0.5 text-xs">{new Date(job.runAt).toLocaleString()}</p>
              </div>
              {job.cronExpression && (
                <div>
                  <span className="text-gray-500">Cron Expression</span>
                  <p className="text-gray-200 font-mono mt-0.5 text-xs">{job.cronExpression}</p>
                </div>
              )}
              {job.batchId && (
                <div>
                  <span className="text-gray-500">Batch ID</span>
                  <p className="text-gray-200 font-mono mt-0.5 text-xs break-all">{job.batchId}</p>
                </div>
              )}
              <div>
                <span className="text-gray-500">Created</span>
                <p className="text-gray-200 mt-0.5 text-xs">{new Date(job.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-gray-500">Updated</span>
                <p className="text-gray-200 mt-0.5 text-xs">{new Date(job.updatedAt).toLocaleString()}</p>
              </div>
            </div>

            {canRetry && (
              <button
                id="retry-job-btn"
                onClick={handleRetry}
                disabled={retrying}
                className="mt-5 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
              >
                {retrying ? 'Retrying...' : '↻ Retry Now'}
              </button>
            )}

            <button
              onClick={load}
              className="mt-2 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2 rounded-lg text-sm transition-colors"
            >
              ↻ Refresh
            </button>
          </div>

          {/* Payload */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-3 text-sm">Payload</h2>
            <pre className="text-xs text-gray-300 font-mono bg-gray-800 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(payloadObj, null, 2)}
            </pre>
          </div>
        </div>

        {/* Right: Execution log */}
        <div className="lg:col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Execution Log</h2>
              <p className="text-xs text-gray-500 mt-0.5">Every status transition recorded in the database</p>
            </div>

            {logs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No execution log entries yet</div>
            ) : (
              <div className="divide-y divide-gray-800">
                {logs.map((log, i) => (
                  <div key={log.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-indigo-900/50 border border-indigo-800 rounded-full flex items-center justify-center text-xs text-indigo-400 flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[log.fromStatus] || 'text-gray-400 bg-gray-800'}`}>
                            {log.fromStatus}
                          </span>
                          <span className="text-gray-600">→</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[log.toStatus] || 'text-gray-400 bg-gray-800'}`}>
                            {log.toStatus}
                          </span>
                          <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {log.message && (
                          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{log.message}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
