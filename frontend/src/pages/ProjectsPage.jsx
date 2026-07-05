import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getProjects, createProject, deleteProject } from '../api/client'

export default function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    try {
      const res = await getProjects()
      setProjects(res.data.projects)
    } catch (err) {
      setError('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await createProject(form)
      setForm({ name: '', description: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create project')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete project "${name}" and all its queues/jobs?`)) return
    try {
      await deleteProject(id)
      load()
    } catch {
      setError('Failed to delete project')
    }
  }

  if (loading) return <div className="text-gray-400 p-8 text-center">Loading projects...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-gray-400 text-sm mt-1">Organize your job queues by project</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Project'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-white mb-4">New Project</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name *</label>
              <input
                id="project-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="e.g. Email Service"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <input
                id="project-description"
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-4">📁</div>
          <p className="text-gray-400">No projects yet. Create your first one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <Link to={`/projects/${project.id}`} className="font-semibold text-white hover:text-indigo-400 transition-colors">
                  {project.name}
                </Link>
                <button
                  onClick={() => handleDelete(project.id, project.name)}
                  className="text-gray-600 hover:text-red-400 text-sm transition-colors ml-2"
                  title="Delete project"
                >
                  ✕
                </button>
              </div>
              {project.description && (
                <p className="text-gray-400 text-sm mb-3 line-clamp-2">{project.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{project._count?.queues ?? 0} queue{project._count?.queues !== 1 ? 's' : ''}</span>
                <span>{new Date(project.createdAt).toLocaleDateString()}</span>
              </div>
              <Link
                to={`/projects/${project.id}`}
                className="mt-3 block text-center text-sm text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-900 hover:border-indigo-700 rounded-lg py-1.5"
              >
                View Queues →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
