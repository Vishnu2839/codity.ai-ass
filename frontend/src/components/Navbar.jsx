import { Link, useNavigate } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  })()

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
            ⚙️ Job Scheduler
          </Link>
          {user && (
            <Link to="/projects" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">
              Projects
            </Link>
          )}
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="text-sm text-gray-400">
                Logged in as <span className="text-gray-200 font-medium">{user.name}</span>
              </span>
              <button
                onClick={logout}
                className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-md transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <div className="flex gap-2">
              <Link to="/login" className="text-sm text-gray-400 hover:text-gray-200 px-3 py-1.5 transition-colors">Login</Link>
              <Link to="/register" className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md transition-colors">Register</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
