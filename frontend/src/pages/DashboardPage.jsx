import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard } from '../api/client'
import { 
  Layers, 
  PlayCircle, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  RefreshCw, 
  Skull, 
  Server, 
  Heart, 
  Clock, 
  Zap, 
  Award 
} from 'lucide-react'

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    try {
      const res = await getDashboard()
      setData(res.data)
    } catch (err) {
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !data) return <div className="text-gray-500 p-8 flex justify-center items-center h-full">Loading dashboard...</div>
  if (error) return <div className="text-red-400 p-8 text-center">{error}</div>
  if (!data) return null

  const stats = data.stats;

  const cards = [
    { label: 'TOTAL JOBS', value: stats.totalJobs, icon: Layers, color: 'text-blue-400', bg: 'bg-blue-900/30' },
    { label: 'RUNNING', value: stats.byStatus.running || 0, icon: PlayCircle, color: 'text-purple-400', bg: 'bg-purple-900/30' },
    { label: 'COMPLETED', value: stats.byStatus.completed || 0, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-900/30' },
    { label: 'FAILED', value: stats.byStatus.failed || 0, icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/30' },
    
    { label: 'QUEUED', value: stats.byStatus.queued || 0, icon: Calendar, color: 'text-amber-400', bg: 'bg-amber-900/30' },
    { label: 'RETRY JOBS', value: stats.retryJobs, icon: RefreshCw, color: 'text-orange-400', bg: 'bg-orange-900/30' },
    { label: 'DLQ COUNT', value: stats.dlqCount, icon: Skull, color: 'text-rose-400', bg: 'bg-rose-900/30' },
    { label: 'ACTIVE WORKERS', value: stats.activeWorkers, icon: Server, color: 'text-blue-400', bg: 'bg-blue-900/30' },
    
    { label: 'QUEUE HEALTH', value: stats.queueHealth, icon: Heart, color: 'text-teal-400', bg: 'bg-teal-900/30' },
    { label: 'AVG EXEC TIME', value: stats.avgExecTime, icon: Clock, color: 'text-fuchsia-400', bg: 'bg-fuchsia-900/30' },
    { label: 'THROUGHPUT', value: stats.throughput, icon: Zap, color: 'text-blue-400', bg: 'bg-blue-900/30' },
    { label: 'SUCCESS RATE', value: stats.successRate, icon: Award, color: 'text-emerald-400', bg: 'bg-emerald-900/30' },
  ]

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm hover:border-gray-700 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[11px] font-bold text-gray-500 tracking-wider mb-2">{card.label}</p>
                  <h3 className="text-3xl font-bold text-gray-100">{card.value}</h3>
                </div>
                <div className={`p-2.5 rounded-xl ${card.bg}`}>
                  <Icon className={`w-6 h-6 ${card.color}`} strokeWidth={2} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Executions Table */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl shadow-sm flex flex-col">
          <div className="p-5 border-b border-gray-800 flex justify-between items-center">
            <h2 className="text-base font-bold text-gray-200">Active Executions</h2>
            <div className="bg-blue-900/30 text-blue-400 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 border border-blue-900/50">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
              {data.activeExecutions.length} Active
            </div>
          </div>
          
          <div className="p-0 overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-800 bg-gray-900/50">
                <tr>
                  <th className="py-4 px-5">ID</th>
                  <th className="py-4 px-5">JOB ID</th>
                  <th className="py-4 px-5">WORKER</th>
                  <th className="py-4 px-5">ATTEMPT</th>
                  <th className="py-4 px-5">STARTED AT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.activeExecutions.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-gray-500">No active executions</td>
                  </tr>
                ) : (
                  data.activeExecutions.map((exec, idx) => (
                    <tr key={idx} className="hover:bg-gray-800/50 transition-colors group">
                      <td className="py-4 px-5 font-semibold text-gray-300">{exec.id}</td>
                      <td className="py-4 px-5 text-gray-500">{exec.jobId}</td>
                      <td className="py-4 px-5 text-gray-400">{exec.worker}</td>
                      <td className="py-4 px-5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-900/30 text-blue-400 border border-blue-900/50">
                          <span className="w-1 h-1 rounded-full bg-blue-400"></span>
                          {exec.attempt}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-gray-500">{new Date(exec.startedAt).toLocaleTimeString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resource Overview */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-sm">
          <div className="p-5 border-b border-gray-800">
            <h2 className="text-base font-bold text-gray-200">Resource Overview</h2>
          </div>
          
          <div className="p-5 space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-semibold text-gray-400">Worker Utilization</span>
                <span className="font-bold text-gray-200">33%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '33%' }}></div>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-800/50">
                <span className="text-sm font-medium text-gray-400">Organizations</span>
                <span className="text-sm font-bold text-gray-200">1</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-800/50">
                <span className="text-sm font-medium text-gray-400">Projects</span>
                <span className="text-sm font-bold text-gray-200">{stats.projects}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-800/50">
                <span className="text-sm font-medium text-gray-400">Total Queues</span>
                <span className="text-sm font-bold text-gray-200">{stats.queues}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
