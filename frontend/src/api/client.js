import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Inject JWT token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401 — clear token and redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────
export const register = (data) => api.post('/auth/register', data)
export const login = (data) => api.post('/auth/login', data)
export const getMe = () => api.get('/auth/me')

// ── Projects ──────────────────────────────────
export const getProjects = () => api.get('/projects')
export const getProject = (id) => api.get(`/projects/${id}`)
export const createProject = (data) => api.post('/projects', data)
export const updateProject = (id, data) => api.patch(`/projects/${id}`, data)
export const deleteProject = (id) => api.delete(`/projects/${id}`)

// ── Queues ────────────────────────────────────
export const getQueues = (projectId) => api.get('/queues', { params: { projectId } })
export const getQueue = (id) => api.get(`/queues/${id}`)
export const createQueue = (data) => api.post('/queues', data)
export const updateQueue = (id, data) => api.patch(`/queues/${id}`, data)
export const deleteQueue = (id) => api.delete(`/queues/${id}`)
export const getQueueStats = (id) => api.get(`/queues/${id}/stats`)

// ── Jobs ──────────────────────────────────────
export const getJobs = (params) => api.get('/jobs', { params })
export const getJob = (id) => api.get(`/jobs/${id}`)
export const createJob = (data) => api.post('/jobs', data)
export const retryJob = (id) => api.patch(`/jobs/${id}/retry`)
export const getJobLogs = (id) => api.get(`/jobs/${id}/logs`)
export const getThroughput = (params) => api.get('/jobs/throughput', { params })

// ── Dashboard ─────────────────────────────────
export const getDashboard = () => api.get('/dashboard')

