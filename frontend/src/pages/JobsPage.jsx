import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getJobs } from '../api/client';

const STATUS_COLORS = {
  scheduled: 'text-blue-400 bg-blue-900/40',
  queued: 'text-gray-300 bg-gray-700/60',
  claimed: 'text-purple-400 bg-purple-900/40',
  running: 'text-yellow-400 bg-yellow-900/40',
  completed: 'text-green-400 bg-green-900/40',
  failed: 'text-red-400 bg-red-900/40',
  dead_letter: 'text-orange-400 bg-orange-900/40',
};

const JOB_TYPES = ['immediate', 'delayed', 'scheduled', 'recurring', 'batch'];

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(page = 1) {
    setLoading(true);
    try {
      const res = await getJobs({ page, limit: 10, status: filterStatus || undefined, type: filterType || undefined });
      setJobs(res.data.jobs);
      setPagination(res.data.pagination);
    } catch (err) {
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterStatus, filterType]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">All Jobs</h1>
        <button
          onClick={() => load(pagination.page)}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-sm transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Jobs List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50">
          <div className="flex gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="">All statuses</option>
              {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="">All types</option>
              {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No jobs found matching the criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800 bg-gray-900/30">
                  <th className="px-6 py-3 font-medium">ID</th>
                  <th className="px-6 py-3 font-medium">Queue</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Retry</th>
                  <th className="px-6 py-3 font-medium">Run At</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-gray-800/50 hover:bg-gray-800/80 transition-colors">
                    <td className="px-6 py-3">
                      <Link to={`/jobs/${job.id}`} className="text-indigo-400 hover:text-indigo-300 font-mono text-xs">
                        {job.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      {job.queue ? (
                        <Link to={`/queues/${job.queue.id}`} className="text-gray-300 hover:text-white transition-colors">
                          {job.queue.name}
                        </Link>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-300 capitalize">{job.type}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[job.status] || 'text-gray-400 bg-gray-800'}`}>
                        {job.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-400">{job.retryCount}/{job.maxRetries}</td>
                    <td className="px-6 py-3 text-gray-400 text-xs">{new Date(job.runAt).toLocaleString()}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{new Date(job.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-gray-900/30">
            <span className="text-sm text-gray-500">
              Showing <span className="text-gray-300">{jobs.length}</span> of <span className="text-gray-300">{pagination.total}</span> jobs
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => load(pagination.page - 1)}
                className="text-sm font-medium bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 px-4 py-2 rounded-lg transition-colors border border-gray-700 disabled:border-transparent"
              >
                Previous
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => load(pagination.page + 1)}
                className="text-sm font-medium bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 px-4 py-2 rounded-lg transition-colors border border-gray-700 disabled:border-transparent"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
