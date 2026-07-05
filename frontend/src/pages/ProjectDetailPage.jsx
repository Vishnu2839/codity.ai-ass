import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProject, createQueue, updateQueue, deleteQueue } from '../api/client'

const RETRY_POLICIES = ['fixed', 'linear', 'exponential']

export default function ProjectDetailPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [queues, setQueues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    priority: 0,
    retryPolicyType: 'exponential',
    retryBaseDelaySeconds: 30,
    maxRetries: 3,
    concurrency: 1,
  })
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    try {
      const res = await getProject(projectId)
      setProject(res.data.project)
      setQueues(res.data.project.queues || [])
    } catch {
      setError('Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId])

  async function handleCreate(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await createQueue({ ...form, projectId })
      setForm({ name: '', priority: 0, retryPolicyType: 'exponential', retryBaseDelaySeconds: 30, maxRetries: 3, concurrency: 1 })
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create queue')
    } finally {
      setSubmitting(false)
    }
  }

  async function togglePause(queue) {
    try {
      await updateQueue(queue.id, { isPaused: !queue.isPaused })
      load()
    } catch {
      setError('Failed to update queue')
    }
  }

  async function handleDeleteQueue(id, name) {
    if (!confirm(`Delete queue "${name}"? All its jobs will be deleted.`)) return
    try {
      await deleteQueue(id)
      load()
    } catch {
      setError('Failed to delete queue')
    }
  }

  if (loading) return <div className="text-gray-400 p-8 text-center">Loading...</div>
  if (!project) return <div className="text-red-400 p-8 text-center">{error || 'Project not found'}</div>

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4">
        <Link to="/projects" className="hover:text-gray-300 transition-colors">Projects</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-200">{project.name}</span>
      </nav>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          {project.description && <p className="text-gray-400 text-sm mt-1">{project.description}</p>}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Queue'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-white mb-4">New Queue</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <div className="col-span-2 lg:col-span-1">
              <label className="block text-sm text-gray-400 mb-1">Queue Name *</label>
              <input
                id="queue-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="e.g. email-queue"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Priority</label>
              <input
                id="queue-priority"
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Concurrency</label>
              <input
                id="queue-concurrency"
                type="number"
                min="1"
                value={form.concurrency}
                onChange={(e) => setForm({ ...form, concurrency: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Retry Policy</label>
              <select
                id="queue-retry-policy"
                value={form.retryPolicyType}
                onChange={(e) => setForm({ ...form, retryPolicyType: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                {RETRY_POLICIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Base Delay (s)</label>
              <input
                id="queue-base-delay"
                type="number"
                min="1"
                value={form.retryBaseDelaySeconds}
                onChange={(e) => setForm({ ...form, retryBaseDelaySeconds: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Retries</label>
              <input
                id="queue-max-retries"
                type="number"
                min="0"
                value={form.maxRetries}
                onChange={(e) => setForm({ ...form, maxRetries: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Queue'}
          </button>
        </form>
      )}

      {queues.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-gray-400">No queues yet. Create your first queue above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {queues.map((queue) => (
            <div key={queue.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Link to={`/queues/${queue.id}`} className="font-semibold text-white hover:text-indigo-400 transition-colors">
                    {queue.name}
                  </Link>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${queue.isPaused ? 'bg-yellow-900/60 text-yellow-400' : 'bg-green-900/60 text-green-400'}`}>
                    {queue.isPaused ? '⏸ Paused' : '▶ Active'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => togglePause(queue)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${queue.isPaused ? 'bg-green-900/40 hover:bg-green-800/60 text-green-400' : 'bg-yellow-900/40 hover:bg-yellow-800/60 text-yellow-400'}`}
                  >
                    {queue.isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    onClick={() => handleDeleteQueue(queue.id, queue.name)}
                    className="text-xs px-3 py-1.5 bg-red-900/30 hover:bg-red-800/50 text-red-400 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                <span>Priority: <span className="text-gray-200">{queue.priority}</span></span>
                <span>Policy: <span className="text-gray-200">{queue.retryPolicyType}</span></span>
                <span>Base delay: <span className="text-gray-200">{queue.retryBaseDelaySeconds}s</span></span>
                <span>Max retries: <span className="text-gray-200">{queue.maxRetries}</span></span>
                <span>Concurrency: <span className="text-gray-200">{queue.concurrency}</span></span>
              </div>
              <Link
                to={`/queues/${queue.id}`}
                className="mt-3 inline-block text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                View Jobs →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
